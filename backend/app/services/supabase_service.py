"""
Supabase Service - Optimized Analytics Queries
Replaces slow Airtable queries with fast PostgreSQL queries.
Performance: 20-50ms vs 2-5s with Airtable
"""
import os
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from dotenv import load_dotenv
from backend.app.core.funnel_email_config import get_verified_new_comer_tags

load_dotenv()

class SupabaseService:
    def __init__(self):
        self.db_url = os.getenv("SUPABASE_DATABASE_URL")
        if not self.db_url:
            raise ValueError("SUPABASE_DATABASE_URL not found in environment variables")
        
        # Create connection pool instead of single connection
        # keepalives prevent Supabase from closing idle connections silently
        try:
            pool_max_connections = max(
                2,
                min(int(os.getenv("SUPABASE_POOL_MAX", "4")), 6),
            )
            self._pool = psycopg2.pool.SimpleConnectionPool(
                1,   # minconn
                pool_max_connections,
                self.db_url,
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=10,
                keepalives_count=5,
            )
            print("Supabase connection pool created successfully")
        except Exception as e:
            print(f"Failed to create connection pool: {e}")
            raise
    
    def _get_connection(self):
        """Get connection from pool"""
        try:
            conn = self._pool.getconn()
            return conn
        except Exception as e:
            print(f"❌ Error getting connection from pool: {e}")
            raise
    
    def _return_connection(self, conn, close_it: bool = False):
        """Return connection to pool, or close it if it's stale/broken."""
        if conn:
            if close_it:
                # Don't return stale/broken connections to the pool — discard them
                try:
                    self._pool.putconn(conn, close=True)
                except Exception:
                    try:
                        conn.close()
                    except Exception:
                        pass
            else:
                self._pool.putconn(conn)

    def _is_connection_error(self, e: Exception) -> bool:
        """Check if an exception is a stale/broken connection error."""
        stale_keywords = [
            "connection timed out",
            "could not send data",
            "could not receive data",
            "connection reset",
            "broken pipe",
            "server closed the connection",
            "ssl connection has been closed",
            "terminating connection",
        ]
        msg = str(e).lower()
        return any(kw in msg for kw in stale_keywords)

    def _execute_query(self, query: str, params: tuple = None) -> List[Dict]:
        """Execute query and return results as list of dicts.
        Retries once with a fresh connection if a stale connection is detected.
        """
        for attempt in range(2):  # attempt 0 = normal, attempt 1 = retry with fresh conn
            conn = None
            stale = False
            try:
                conn = self._get_connection()
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    cursor.execute(query, params or ())
                    results = cursor.fetchall()
                conn.commit()
                return results
            except Exception as e:
                stale = self._is_connection_error(e)
                if conn:
                    try:
                        conn.rollback()
                    except Exception:
                        stale = True  # rollback failed too — definitely stale
                if attempt == 0 and stale:
                    print(f"[DB] Stale connection detected, retrying with fresh connection. Error: {e}")
                else:
                    print(f"[DB] ERROR executing query (attempt {attempt + 1}): {e}")
                    print(f"Query: {query}")
                    raise
            finally:
                self._return_connection(conn, close_it=stale)
        # Should never reach here
        raise RuntimeError("_execute_query exhausted retries")

    def _execute_one(self, query: str, params: tuple = None) -> Optional[Dict]:
        """Execute query and return single result"""
        results = self._execute_query(query, params)
        return results[0] if results else None
    
    # ==========================================
    # CAMPAIGN DONATIONS (Optimized)
    # ==========================================
    
    def get_campaign_donations(
        self,
        campaign_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        page_size: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get paginated donations for a campaign with optional date filters.
        Uses Costa Rica timezone (America/Costa_Rica) for date comparisons.
        
        Performance: ~20-50ms (vs 2-5s with Airtable)
        """
        # Build WHERE clause with Costa Rica timezone
        where_clauses = ["c.airtable_id = %s"]
        params = [campaign_id]
        
        if start_date:
            where_clauses.append("(d.donation_date AT TIME ZONE 'America/Costa_Rica')::date >= %s")
            params.append(start_date)
        
        if end_date:
            where_clauses.append("(d.donation_date AT TIME ZONE 'America/Costa_Rica')::date <= %s")
            params.append(end_date)
        
        where_sql = " AND ".join(where_clauses)
        
        # Query for donations with donor info
        query = f"""
            SELECT 
                d.airtable_id as id,
                d.amount,
                d.donation_date as date,
                COALESCE(don.name, 'Unknown') as "donorName",
                COALESCE(don.emails[1], 'N/A') as "donorEmail"
            FROM donations d
            JOIN form_titles ft ON d.form_title_id = ft.id
            JOIN campaigns c ON ft.campaign_id = c.id
            LEFT JOIN donors don ON d.donor_id = don.id
            WHERE {where_sql}
            ORDER BY d.donation_date DESC
            LIMIT %s OFFSET %s
        """
        
        params.extend([page_size, offset])
        donations = self._execute_query(query, tuple(params))
        
        # Get total count
        count_query = f"""
            SELECT COUNT(*) as count
            FROM donations d
            JOIN form_titles ft ON d.form_title_id = ft.id
            JOIN campaigns c ON ft.campaign_id = c.id
            WHERE {where_sql}
        """
        
        count_result = self._execute_one(count_query, tuple(params[:len(params)-2]))
        total_count = count_result['count'] if count_result else 0
        
        return {
            "donations": [dict(d) for d in donations],
            "total_count": total_count
        }
    
    def get_source_donations(
        self,
        source_name: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        page_size: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get paginated donations for all campaigns in a source with optional date filters.
        Uses Costa Rica timezone (America/Costa_Rica) for date comparisons.
        """
        # Build WHERE clause with Costa Rica timezone
        where_clauses = ["c.source = %s"]
        params = [source_name]
        
        if start_date:
            where_clauses.append("(d.donation_date AT TIME ZONE 'America/Costa_Rica')::date >= %s")
            params.append(start_date)
        
        if end_date:
            where_clauses.append("(d.donation_date AT TIME ZONE 'America/Costa_Rica')::date <= %s")
            params.append(end_date)
        
        where_sql = " AND ".join(where_clauses)
        
        # Query for donations with donor info
        query = f"""
            SELECT 
                d.airtable_id as id,
                d.amount,
                d.donation_date as date,
                COALESCE(don.name, 'Unknown') as "donorName",
                COALESCE(don.emails[1], 'N/A') as "donorEmail"
            FROM donations d
            JOIN form_titles ft ON d.form_title_id = ft.id
            JOIN campaigns c ON ft.campaign_id = c.id
            LEFT JOIN donors don ON d.donor_id = don.id
            WHERE {where_sql}
            ORDER BY d.donation_date DESC
            LIMIT %s OFFSET %s
        """
        
        params.extend([page_size, offset])
        donations = self._execute_query(query, params)
        
        # Get total count
        count_query = f"""
            SELECT COUNT(*) as count
            FROM donations d
            JOIN form_titles ft ON d.form_title_id = ft.id
            JOIN campaigns c ON ft.campaign_id = c.id
            WHERE {where_sql}
        """
        
        count_result = self._execute_one(count_query, tuple(params[:len(params)-2]))
        total_count = count_result['count'] if count_result else 0
        
        return {
            "donations": [dict(d) for d in donations],
            "total_count": total_count
        }

    
    # ==========================================
    # CAMPAIGN STATS (Optimized)
    # ==========================================
    
    def get_campaign_stats(
        self,
        campaign_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        form_title_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Get campaign statistics with optional filters.
        Uses Costa Rica timezone for date comparisons.
        
        Performance: ~10-30ms (vs 3-8s with Airtable)
        """
        # Query for breakdown by form title
        query = """
            SELECT 
                ft.airtable_id as form_title_id,
                ft.name as form_title_name,
                COALESCE(SUM(d.amount), 0) as total_amount,
                COUNT(d.id) as donation_count,
                MIN(d.donation_date) as start_date
            FROM campaigns c
            LEFT JOIN form_titles ft ON ft.campaign_id = c.id
            LEFT JOIN donations d ON d.form_title_id = ft.id
                AND (%(start_date)s IS NULL OR (d.donation_date AT TIME ZONE 'America/Costa_Rica')::date >= %(start_date)s::date)
                AND (%(end_date)s IS NULL OR (d.donation_date AT TIME ZONE 'America/Costa_Rica')::date <= %(end_date)s::date)
            WHERE c.airtable_id = %(campaign_id)s
                AND (%(form_title_ids)s IS NULL OR ft.airtable_id = ANY(%(form_title_ids)s))
            GROUP BY ft.id, ft.airtable_id, ft.name
            HAVING COUNT(d.id) > 0
            ORDER BY MIN(d.donation_date) ASC
        """
        
        query_params = {
            'campaign_id': campaign_id,
            'start_date': start_date,
            'end_date': end_date,
            'form_title_ids': form_title_ids
        }
        
        breakdown = self._execute_query(query, query_params)
        
        # Calculate totals
        campaign_total_amount = sum(float(row['total_amount']) for row in breakdown)
        campaign_total_count = sum(int(row['donation_count']) for row in breakdown)
        
        return {
            "campaign_total_amount": round(campaign_total_amount, 2),
            "campaign_total_count": campaign_total_count,
            "stats_by_form_title": [
                {
                    "form_title_id": row['form_title_id'],
                    "form_title_name": row['form_title_name'],
                    "total_amount": float(row['total_amount']),
                    "donation_count": int(row['donation_count']),
                    "start_date": row['start_date'].isoformat() if row['start_date'] else None
                }
                for row in breakdown
            ]
        }
    
    # ==========================================
    # SOURCE STATS (Optimized)
    # ==========================================
    
    def get_source_stats(
        self,
        source: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get statistics for all campaigns in a source.
        Uses Costa Rica timezone for date comparisons.
        
        Performance: ~15-40ms (vs 5-10s with Airtable)
        """
        query = """
            SELECT 
                c.airtable_id as campaign_id,
                c.name as campaign_name,
                COALESCE(SUM(d.amount), 0) as total_amount,
                COUNT(d.id) as donation_count,
                MIN(d.donation_date) as start_date
            FROM campaigns c
            LEFT JOIN form_titles ft ON ft.campaign_id = c.id
            LEFT JOIN donations d ON d.form_title_id = ft.id
                AND (%(start_date)s IS NULL OR (d.donation_date AT TIME ZONE 'America/Costa_Rica')::date >= %(start_date)s::date)
                AND (%(end_date)s IS NULL OR (d.donation_date AT TIME ZONE 'America/Costa_Rica')::date <= %(end_date)s::date)
            WHERE c.source = %(source)s
            GROUP BY c.id, c.airtable_id, c.name
            HAVING COUNT(d.id) > 0
            ORDER BY MIN(d.donation_date) ASC
        """
        
        breakdown = self._execute_query(query, {
            'source': source,
            'start_date': start_date,
            'end_date': end_date
        })
        
        source_total_amount = sum(float(row['total_amount']) for row in breakdown)
        source_total_count = sum(int(row['donation_count']) for row in breakdown)
        
        return {
            "source_total_amount": round(source_total_amount, 2),
            "source_total_count": source_total_count,
            "stats_by_campaign": [
                {
                    "campaign_id": row['campaign_id'],
                    "campaign_name": row['campaign_name'],
                    "total_amount": float(row['total_amount']),
                    "donation_count": int(row['donation_count']),
                    "start_date": row['start_date'].isoformat() if row['start_date'] else None
                }
                for row in breakdown
            ]
        }
    
    # ==========================================
    # FORM TITLE DONATIONS (Optimized)
    # ==========================================
    
    def get_donations_for_form_title(
        self,
        form_title_ids: List[str],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        page_size: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get donations for specific form titles.
        Uses Costa Rica timezone for date comparisons.
        """
        # Build WHERE clause with Costa Rica timezone
        where_clauses = ["ft.airtable_id = ANY(%s)"]
        params = [form_title_ids]
        
        if start_date:
            where_clauses.append("(d.donation_date AT TIME ZONE 'America/Costa_Rica')::date >= %s")
            params.append(start_date)
        
        if end_date:
            where_clauses.append("(d.donation_date AT TIME ZONE 'America/Costa_Rica')::date <= %s")
            params.append(end_date)
        
        where_sql = " AND ".join(where_clauses)
        
        query = f"""
            SELECT 
                d.airtable_id as id,
                d.amount,
                d.donation_date as date,
                COALESCE(don.name, 'Unknown') as "donorName",
                COALESCE(don.emails[1], 'N/A') as "donorEmail"
            FROM donations d
            JOIN form_titles ft ON d.form_title_id = ft.id
            LEFT JOIN donors don ON d.donor_id = don.id
            WHERE {where_sql}
            ORDER BY d.donation_date DESC
            LIMIT %s OFFSET %s
        """
        
        params.extend([page_size, offset])
        donations = self._execute_query(query, tuple(params))
        
        # Get total count
        count_query = f"""
            SELECT COUNT(*) as count
            FROM donations d
            JOIN form_titles ft ON d.form_title_id = ft.id
            WHERE {where_sql}
        """
        
        count_result = self._execute_one(count_query, tuple(params[:len(params)-2]))
        total_count = count_result['count'] if count_result else 0
        
        return {
            "donations": [dict(d) for d in donations],
            "total_count": total_count
        }
    
    
    # ==========================================
    # DAILY SUMMARIES (Optimized)
    # ==========================================
    
    def get_daily_summaries(self, start_date: date, end_date: date) -> List[Dict[str, Any]]:
        """
        Get daily summaries from the daily_metrics view.
        """
        query = """
            SELECT 
                date::text,
                total_amount as total,
                donation_count as count
            FROM daily_metrics
            WHERE date >= %s AND date <= %s
            ORDER BY date ASC
        """
        
        results = self._execute_query(query, (start_date, end_date))
        
        return [
            {
                "date": row['date'],
                "total": float(row['total']),
                "count": int(row['count'])
            }
            for row in results
        ]

    def get_strategic_insights(self) -> Dict[str, Any]:
        """Return compact, decision-oriented fundraising insights.

        All values are derived from Airtable-synced tables. Keeping these as
        queries avoids persisting duplicated metrics that can become stale.
        """
        performance = self._execute_one("""
            SELECT
                COALESCE(SUM(total_amount) FILTER (
                    WHERE date >= CURRENT_DATE - INTERVAL '29 days'
                ), 0) AS current_amount,
                COALESCE(SUM(donation_count) FILTER (
                    WHERE date >= CURRENT_DATE - INTERVAL '29 days'
                ), 0) AS current_count,
                COALESCE(SUM(total_amount) FILTER (
                    WHERE date BETWEEN CURRENT_DATE - INTERVAL '59 days'
                                   AND CURRENT_DATE - INTERVAL '30 days'
                ), 0) AS previous_amount,
                COALESCE(SUM(donation_count) FILTER (
                    WHERE date BETWEEN CURRENT_DATE - INTERVAL '59 days'
                                   AND CURRENT_DATE - INTERVAL '30 days'
                ), 0) AS previous_count
            FROM daily_metrics
            WHERE date >= CURRENT_DATE - INTERVAL '59 days'
        """) or {}

        audience = self._execute_one("""
            WITH donor_totals AS (
                SELECT
                    donor_id,
                    COUNT(*) AS gift_count,
                    COALESCE(SUM(amount), 0) AS lifetime_amount
                FROM donations
                WHERE donor_id IS NOT NULL
                GROUP BY donor_id
            )
            SELECT
                (SELECT COUNT(*) FROM donors) AS known_donors,
                COUNT(*) AS donors_with_gifts,
                COUNT(*) FILTER (WHERE gift_count = 1) AS one_time_donors,
                COUNT(*) FILTER (WHERE gift_count >= 2) AS repeat_donors,
                COUNT(*) FILTER (WHERE gift_count >= 3) AS three_plus_donors,
                COUNT(*) FILTER (WHERE lifetime_amount >= 1000) AS high_value_donors,
                COUNT(*) FILTER (WHERE lifetime_amount >= 5000) AS major_donors
            FROM donor_totals
        """) or {}

        timing = self._execute_one("""
            SELECT
                TRIM(TO_CHAR(date, 'Day')) AS weekday,
                COALESCE(AVG(total_amount), 0) AS average_daily_amount,
                COALESCE(AVG(donation_count), 0) AS average_daily_donations
            FROM daily_metrics
            WHERE date >= CURRENT_DATE - INTERVAL '89 days'
            GROUP BY EXTRACT(DOW FROM date), TO_CHAR(date, 'Day')
            ORDER BY AVG(total_amount) DESC
            LIMIT 1
        """) or {}

        channel = self._execute_one("""
            SELECT
                COALESCE(c.source, 'Unknown') AS source,
                COALESCE(SUM(d.amount), 0) AS total_amount,
                COUNT(d.id) AS donation_count,
                COUNT(DISTINCT c.id) AS campaign_count
            FROM campaigns c
            JOIN form_titles ft ON ft.campaign_id = c.id
            JOIN donations d ON d.form_title_id = ft.id
            WHERE d.donation_date >= CURRENT_DATE - INTERVAL '89 days'
            GROUP BY COALESCE(c.source, 'Unknown')
            ORDER BY SUM(d.amount) DESC
            LIMIT 1
        """) or {}

        current_amount = float(performance.get('current_amount') or 0)
        previous_amount = float(performance.get('previous_amount') or 0)
        current_count = int(performance.get('current_count') or 0)
        previous_count = int(performance.get('previous_count') or 0)
        current_average = current_amount / current_count if current_count else 0
        previous_average = previous_amount / previous_count if previous_count else 0

        def percent_change(current: float, previous: float) -> float:
            if previous == 0:
                return 100.0 if current > 0 else 0.0
            return round(((current - previous) / previous) * 100, 1)

        known_donors = int(audience.get('known_donors') or 0)
        donors_with_gifts = int(audience.get('donors_with_gifts') or 0)
        repeat_donors = int(audience.get('repeat_donors') or 0)
        channel_amount = float(channel.get('total_amount') or 0)
        channel_count = int(channel.get('donation_count') or 0)

        return {
            "period": {
                "days": 30,
                "amount": round(current_amount, 2),
                "donations": current_count,
                "averageGift": round(current_average, 2),
                "amountChangePct": percent_change(current_amount, previous_amount),
                "donationChangePct": percent_change(current_count, previous_count),
                "averageGiftChangePct": percent_change(current_average, previous_average),
            },
            "audience": {
                "knownDonors": known_donors,
                "donorsWithGifts": donors_with_gifts,
                "oneTimeDonors": int(audience.get('one_time_donors') or 0),
                "repeatDonors": repeat_donors,
                "threePlusDonors": int(audience.get('three_plus_donors') or 0),
                "highValueDonors": int(audience.get('high_value_donors') or 0),
                "majorDonors": int(audience.get('major_donors') or 0),
                "repeatRatePct": round((repeat_donors / donors_with_gifts) * 100, 1) if donors_with_gifts else 0,
                "reactivationPool": max(known_donors - donors_with_gifts, 0),
            },
            "timing": {
                "bestWeekday": timing.get('weekday') or '—',
                "averageDailyAmount": round(float(timing.get('average_daily_amount') or 0), 2),
                "averageDailyDonations": round(float(timing.get('average_daily_donations') or 0), 1),
            },
            "channel": {
                "periodDays": 90,
                "topSource": channel.get('source') or '—',
                "amount": round(channel_amount, 2),
                "donations": channel_count,
                "campaigns": int(channel.get('campaign_count') or 0),
                "averageGift": round(channel_amount / channel_count, 2) if channel_count else 0,
            },
            "generatedAt": datetime.now().isoformat(),
        }

    def get_hourly_trend(self, target_date: date) -> List[Dict[str, Any]]:
        """
        Get hourly trend for a specific date.
        Aggregates donations by hour in Costa Rica timezone.
        """
        query = """
            SELECT 
                to_char(d.donation_date AT TIME ZONE 'America/Costa_Rica', 'HH24:00') as hour,
                COALESCE(SUM(d.amount), 0) as total,
                COUNT(d.id) as count
            FROM donations d
            WHERE (d.donation_date AT TIME ZONE 'America/Costa_Rica')::date = %s
            GROUP BY hour
            ORDER BY hour ASC
        """
        
        results = self._execute_query(query, (target_date,))
        
        # Fill in missing hours for a complete 00-23 timeline
        hourly_map = {row['hour']: row for row in results}
        final_results = []
        
        for h in range(24):
            hour_str = f"{h:02d}:00"
            if hour_str in hourly_map:
                row = hourly_map[hour_str]
                final_results.append({
                    "date": hour_str, # Using 'date' key to match frontend expectation
                    "total": float(row['total']),
                    "count": int(row['count'])
                })
            else:
                final_results.append({
                    "date": hour_str,
                    "total": 0.0,
                    "count": 0
                })
                
        return final_results

    # ==========================================
    # TOP DONORS (Optimized)
    # ==========================================

    def get_top_donors_stats(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get top donors by total donation amount.
        """
        query = """
            SELECT 
                d.emails[1] as email,
                d.name,
                SUM(don.amount) as "totalAmount",
                COUNT(don.id) as "donationsCount",
                MIN(don.donation_date) as "firstDonationDate"
            FROM donors d
            JOIN donations don ON don.donor_id = d.id
            WHERE d.emails IS NOT NULL AND array_length(d.emails, 1) > 0
            GROUP BY d.id, d.name, d.emails
            ORDER BY "totalAmount" DESC
            LIMIT %s
        """
        
        results = self._execute_query(query, (limit,))
        
        return [
            {
                "email": row['email'],
                "name": row['name'],
                "totalAmount": float(row['totalAmount']),
                "donationsCount": int(row['donationsCount']),
                "firstDonationDate": row['firstDonationDate'].isoformat() if row['firstDonationDate'] else None
            }
            for row in results
        ]

    # ==========================================
    # SOURCE BREAKDOWN (Optimized)
    # ==========================================

    def get_monthly_source_breakdown(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """
        Get breakdown of donations by source (Campaigns vs Others).
        Matches AirtableService output format.
        """
        query = """
            SELECT 
                c.source,
                COALESCE(SUM(d.amount), 0) as total_amount
            FROM campaigns c
            JOIN form_titles ft ON ft.campaign_id = c.id
            JOIN donations d ON d.form_title_id = ft.id
            WHERE (d.donation_date AT TIME ZONE 'America/Costa_Rica')::date >= %s
              AND (d.donation_date AT TIME ZONE 'America/Costa_Rica')::date <= %s
            GROUP BY c.source
        """
        
        results = self._execute_query(query, (start_date, end_date))
        
        source_totals = {}
        total_amount_all = 0.0
        
        source_mapping = {
            "Funnel": "New Comers",
            "Big Campaign": "Big Campaigns"
        }
        
        for row in results:
            raw_source = row['source']
            amount = float(row['total_amount'])
            
            # Mapping
            source_name = source_mapping.get(raw_source, raw_source)
            
            # Normalization
            if source_name not in ["Big Campaigns", "Facebook", "New Comers"]:
                source_name = "Others"
            
            source_totals[source_name] = source_totals.get(source_name, 0.0) + amount
            total_amount_all += amount
            
        # Build breakdown list
        breakdown = []
        for source, amount in source_totals.items():
            percentage = round((amount / total_amount_all * 100), 2) if total_amount_all > 0 else 0
            breakdown.append({
                "name": source,
                "value": round(amount, 2),
                "percentage": percentage
            })
            
        return {
            "total_amount": round(total_amount_all, 2),
            "breakdown": breakdown
        }

    # ==========================================
    # CAMPAIGNS LIST (Optimized)
    # ==========================================

    def get_campaigns(self, source: str) -> List[Dict[str, Any]]:
        """
        Get all campaigns for a specific source.
        """
        query = """
            SELECT 
                airtable_id as id,
                name,
                created_at as "createdTime"
            FROM campaigns
            WHERE source = %s
            ORDER BY created_at DESC
        """
        results = self._execute_query(query, (source,))
        return [
            {
                "id": row['id'],
                "name": row['name'],
                "createdTime": row['createdTime'].isoformat() if row['createdTime'] else None
            }
            for row in results
        ]

    def get_form_titles(self, campaign_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get form titles, optionally filtered by campaign.
        """
        params = []
        where_clause = ""
        
        if campaign_id:
            where_clause = "WHERE c.airtable_id = %s"
            params.append(campaign_id)
            
        query = f"""
            SELECT 
                ft.airtable_id as id,
                ft.name,
                ft.created_at as "createdTime",
                c.airtable_id as campaign_id,
                c.name as campaign_name
            FROM form_titles ft
            LEFT JOIN campaigns c ON ft.campaign_id = c.id
            {where_clause}
            ORDER BY ft.created_at DESC
        """
        
        results = self._execute_query(query, tuple(params))
        
        return [
            {
                "id": row['id'],
                "name": row['name'],
                "createdTime": row['createdTime'].isoformat() if row['createdTime'] else None,
                "campaign_id": row['campaign_id'],
                "campaign_name": row['campaign_name']
            }
            for row in results
        ]

    def get_unique_campaign_sources(self) -> List[str]:
        """
        Get unique campaign sources.
        """
        query = """
            SELECT DISTINCT source
            FROM campaigns
            WHERE source IS NOT NULL
            ORDER BY source ASC
        """
        results = self._execute_query(query)
        return [row['source'] for row in results]

    # ==========================================
    # CONTACTS / DONORS (Optimized)
    # ==========================================

    def get_donor_by_email(self, email: str) -> Dict[str, Any]:
        """
        Search for a donor by email and return their info and donations.
        Returns a normalized structure.
        """
        # 1. Find donor by email (checking the emails array)
        # Note: We assume the 'emails' column is a text array (text[])
        donor_query = """
            SELECT 
                id,
                airtable_id,
                name,
                emails
            FROM donors
            WHERE %s = ANY(emails)
            LIMIT 1
        """
        
        donor = self._execute_one(donor_query, (email,))
        
        if not donor:
            return {"donor": None, "donations": []}
            
        # 2. Fetch donations for this donor
        donations_query = """
            SELECT 
                d.airtable_id as id,
                d.amount,
                d.donation_date as date,
                ft.name as form_title
            FROM donations d
            LEFT JOIN form_titles ft ON d.form_title_id = ft.id
            WHERE d.donor_id = %s
            ORDER BY d.donation_date DESC
        """
        
        donations = self._execute_query(donations_query, (donor['id'],))
        
        # Normalize donor data
        normalized_donor = {
            "id": donor['airtable_id'] or str(donor['id']), # Prefer airtable_id for compatibility if exists
            "name": donor.get('name', ''),
            "email": email, # The email we searched for
            "emails": donor.get('emails', []),
            "phone": None  # Phone not available in Supabase donors table
        }
        
        # Normalize donations data
        normalized_donations = [
            {
                "id": d['id'],
                "amount": float(d['amount']),
                "date": d['date'].isoformat() if d['date'] else None,
                "form_title": d['form_title']
            }
            for d in donations
        ]
        
        return {
            "donor": normalized_donor,
            "donations": normalized_donations
        }

    def get_emails_from_ids(self, email_ids: List[str]) -> List[str]:
        """
        In Supabase, we don't use email IDs like Airtable. 
        This method is mainly for compatibility if we were to look up by ID, 
        but for now we can return empty or implement if we had an emails table.
        Assuming we don't have a separate emails table in Supabase (emails are in donors array),
        this might not be needed or applicable in the same way.
        
        However, if the caller passes actual email strings, we just return them.
        If they pass IDs, we can't really resolve them without a mapping table.
        
        For the search endpoint migration, we will try to avoid using this method 
        by using the normalized 'emails' list from 'get_donor_by_email'.
        """
        return []

    # ==========================================
    # FUNNEL STATS (Optimized)
    # ==========================================

    def get_funnel_stats(self) -> Dict[str, Any]:
        """
        Get funnel statistics directly from Supabase.
        """
        try:
            # 1. Total Funnel (Active)
            funnel_data = self._execute_one(
                "SELECT COUNT(*) as count FROM donors WHERE stage = 'Funnel' AND (status IS NULL OR status != 'Unsubscribed')"
            )
            funnel_count = funnel_data['count'] if funnel_data else 0
            
            # 2. Pending Approvals
            pending_data = self._execute_one(
                "SELECT COUNT(*) as count FROM donors WHERE stage = 'Pending Approval' AND region IS NOT NULL AND region != '' AND (status IS NULL OR status NOT IN ('Final Check', 'Potential Duplicate'))"
            )
            pending_count = pending_data['count'] if pending_data else 0

            # 3. Unsubscribed (Funnel only)
            unsub_data = self._execute_one(
                "SELECT COUNT(*) as count FROM donors WHERE stage = 'Funnel' AND status = 'Unsubscribed'"
            )
            unsubscribed_count = unsub_data['count'] if unsub_data else 0
            
            # 4. Breakdown
            breakdown_rows = self._execute_query(
                "SELECT COALESCE(funnel_stage, 'Unknown') as stage, COUNT(*) as count FROM donors WHERE stage = 'Funnel' AND (status IS NULL OR status != 'Unsubscribed') GROUP BY funnel_stage"
            )
            
            # Helper to extract stage number
            import re
            def get_stage_order(stage_name):
                # Extract number from "(Stage X)"
                match = re.search(r'\(Stage (\d+)\)', stage_name)
                if match:
                    return int(match.group(1))
                return 9999 # Push to end if no number
            
            # Construct dictionary first
            raw_breakdown = [{"name": row['stage'], "count": int(row['count'])} for row in breakdown_rows]
            
            # Sort by stage number ASC
            stage_breakdown = sorted(raw_breakdown, key=lambda x: get_stage_order(x['name']))

            return {
                "total_funnel": int(funnel_count),
                "pending_approvals": int(pending_count),
                "total_unsubscribed": int(unsubscribed_count),
                "stage_breakdown": stage_breakdown
            }
        except Exception as e:
            print(f"❌ Error in Supabase get_funnel_stats: {e}")
            return {
                "total_funnel": 0, 
                "pending_approvals": 0, 
                "total_unsubscribed": 0,
                "stage_breakdown": {}
            }

    def _get_brevo_funnel_email_insights(self, days: int) -> Optional[Dict[str, Any]]:
        """Return rate-ready Brevo aggregates when the hourly sync has data."""
        configured_tags = get_verified_new_comer_tags()

        table_check = self._execute_one(
            "SELECT to_regclass('public.brevo_funnel_daily_stats') AS table_name"
        ) or {}
        if not table_check.get("table_name"):
            return None

        summary = self._execute_one("""
            SELECT
                SUM(sent) AS sent,
                SUM(delivered) AS delivered,
                SUM(unique_opens) AS unique_opens,
                SUM(unique_clicks) AS unique_clicks,
                SUM(soft_bounces) AS soft_bounces,
                SUM(hard_bounces) AS hard_bounces,
                SUM(blocked) AS blocked,
                SUM(invalid) AS invalid_emails,
                SUM(spam_reports) AS spam_reports,
                SUM(unsubscribed) AS unsubscribes,
                MAX(synced_at) AS last_synced_at
            FROM brevo_funnel_daily_stats
            WHERE stat_date >= CURRENT_DATE - (%s - 1)
              AND campaign_tag = ANY(%s)
        """, (days, configured_tags)) or {}
        if not summary.get("last_synced_at"):
            return None

        coverage = self._execute_one("""
            SELECT
                %s AS total_tags,
                COUNT(state.last_success_at) AS synced_tags
            FROM brevo_funnel_tag_sync_state state
            WHERE state.campaign_tag = ANY(%s)
        """, (len(configured_tags), configured_tags)) or {}

        trend_rows = self._execute_query("""
            WITH calendar AS (
                SELECT generate_series(
                    CURRENT_DATE - (%s - 1),
                    CURRENT_DATE,
                    INTERVAL '1 day'
                )::date AS date
            ), daily AS (
                SELECT
                    stat_date,
                    SUM(sent) AS sent,
                    SUM(delivered) AS delivered,
                    SUM(unique_opens) AS opens,
                    SUM(unique_clicks) AS clicks,
                    SUM(soft_bounces + hard_bounces + blocked + invalid) AS issues
                FROM brevo_funnel_daily_stats
                WHERE stat_date >= CURRENT_DATE - (%s - 1)
                  AND campaign_tag = ANY(%s)
                GROUP BY stat_date
            )
            SELECT
                calendar.date::text AS date,
                COALESCE(daily.sent, 0) AS sent,
                COALESCE(daily.delivered, 0) AS delivered,
                COALESCE(daily.opens, 0) AS opens,
                COALESCE(daily.clicks, 0) AS clicks,
                COALESCE(daily.issues, 0) AS issues
            FROM calendar
            LEFT JOIN daily ON daily.stat_date = calendar.date
            ORDER BY calendar.date
        """, (days, days, configured_tags))

        device_rows = self._execute_query("""
            SELECT COALESCE(device, 'UNKNOWN') AS device, COUNT(*) AS count
            FROM email_engagement
            WHERE event_timestamp >= NOW() - (%s * INTERVAL '1 day')
              AND event_type IN ('unique_opened', 'click')
            GROUP BY COALESCE(device, 'UNKNOWN')
            ORDER BY COUNT(*) DESC
        """, (days,))

        sent = int(summary.get("sent") or 0)
        delivered = int(summary.get("delivered") or 0)
        unique_opens = int(summary.get("unique_opens") or 0)
        unique_clicks = int(summary.get("unique_clicks") or 0)
        soft_bounces = int(summary.get("soft_bounces") or 0)
        hard_bounces = int(summary.get("hard_bounces") or 0)
        blocked = int(summary.get("blocked") or 0)
        invalid_emails = int(summary.get("invalid_emails") or 0)
        spam_reports = int(summary.get("spam_reports") or 0)
        delivery_issues = soft_bounces + hard_bounces + blocked + invalid_emails
        device_total = sum(int(row["count"]) for row in device_rows)
        last_synced_at = summary["last_synced_at"]
        total_tags = int(coverage.get("total_tags") or 0)
        synced_tags = int(coverage.get("synced_tags") or 0)
        backfill_complete = total_tags > 0 and synced_tags >= total_tags

        return {
            "scope": "new_comer_funnel",
            "scopeLabel": "New Comer Funnel only",
            "source": "Brevo",
            "periodDays": days,
            "totalTags": total_tags,
            "syncedTags": synced_tags,
            "backfillComplete": backfill_complete,
            "sent": sent,
            "delivered": delivered,
            "uniqueOpens": unique_opens,
            "uniqueClicks": unique_clicks,
            "clickEvents": unique_clicks,
            "deliveryRatePct": round((delivered / sent) * 100, 1) if sent else 0,
            "openRatePct": round((unique_opens / delivered) * 100, 1) if delivered else 0,
            "clickRatePct": round((unique_clicks / delivered) * 100, 1) if delivered else 0,
            "clickToOpenActivityPct": round((unique_clicks / unique_opens) * 100, 1) if unique_opens else 0,
            "bounceRatePct": round((delivery_issues / sent) * 100, 1) if sent else 0,
            "deliveryIssues": delivery_issues,
            "softBounces": soft_bounces,
            "hardBounces": hard_bounces,
            "blocked": blocked,
            "invalidEmails": invalid_emails,
            "spamReports": spam_reports,
            "unsubscribes": int(summary.get("unsubscribes") or 0),
            "deviceMix": [
                {
                    "device": row["device"],
                    "count": int(row["count"]),
                    "percentage": round((int(row["count"]) / device_total) * 100, 1) if device_total else 0,
                }
                for row in device_rows
            ],
            "trend": [
                {
                    "date": row["date"],
                    "sent": int(row["sent"] or 0),
                    "delivered": int(row["delivered"] or 0),
                    "opens": int(row["opens"] or 0),
                    "clicks": int(row["clicks"] or 0),
                    "issues": int(row["issues"] or 0),
                }
                for row in trend_rows
            ],
            "rateBasis": "brevo_aggregated",
            "rateNotice": (
                "Delivery and engagement rates use Brevo transactional totals for this funnel only."
                if backfill_complete
                else f"Brevo backfill is in progress ({synced_tags} of {total_tags} tags); rates currently reflect synced tags only."
            ),
            "lastSyncedAt": last_synced_at.isoformat(),
        }

    def get_funnel_email_insights(self, days: int = 30) -> Dict[str, Any]:
        """Email engagement metrics scoped exclusively to the New Comer Funnel."""
        days = max(7, min(days, 90))
        brevo_metrics = self._get_brevo_funnel_email_insights(days)
        if brevo_metrics:
            return brevo_metrics

        summary = self._execute_one("""
            SELECT
                COUNT(*) FILTER (WHERE event_type = 'unique_opened') AS unique_opens,
                COUNT(*) FILTER (WHERE event_type = 'click') AS click_events,
                COUNT(*) FILTER (WHERE event_type = 'soft_bounce') AS soft_bounces,
                COUNT(*) FILTER (WHERE event_type = 'hard_bounce') AS hard_bounces,
                COUNT(*) FILTER (WHERE event_type = 'blocked') AS blocked,
                COUNT(*) FILTER (WHERE event_type = 'invalid_email') AS invalid_emails,
                COUNT(*) FILTER (WHERE event_type = 'spam') AS spam_reports,
                COUNT(*) FILTER (WHERE event_type = 'unsubscribed') AS unsubscribes
            FROM email_engagement
            WHERE event_timestamp >= NOW() - (%s * INTERVAL '1 day')
        """, (days,)) or {}

        device_rows = self._execute_query("""
            SELECT COALESCE(device, 'UNKNOWN') AS device, COUNT(*) AS count
            FROM email_engagement
            WHERE event_timestamp >= NOW() - (%s * INTERVAL '1 day')
              AND event_type IN ('unique_opened', 'click')
            GROUP BY COALESCE(device, 'UNKNOWN')
            ORDER BY COUNT(*) DESC
        """, (days,))

        trend_rows = self._execute_query("""
            WITH calendar AS (
                SELECT generate_series(
                    CURRENT_DATE - (%s - 1),
                    CURRENT_DATE,
                    INTERVAL '1 day'
                )::date AS date
            )
            SELECT
                calendar.date::text AS date,
                COUNT(e.id) FILTER (WHERE e.event_type = 'unique_opened') AS opens,
                COUNT(e.id) FILTER (WHERE e.event_type = 'click') AS clicks,
                COUNT(e.id) FILTER (
                    WHERE e.event_type IN (
                        'soft_bounce', 'hard_bounce', 'blocked',
                        'invalid_email', 'spam'
                    )
                ) AS issues
            FROM calendar
            LEFT JOIN email_engagement e
              ON (e.event_timestamp AT TIME ZONE 'America/Guatemala')::date = calendar.date
            GROUP BY calendar.date
            ORDER BY calendar.date
        """, (days,))

        unique_opens = int(summary.get('unique_opens') or 0)
        click_events = int(summary.get('click_events') or 0)
        soft_bounces = int(summary.get('soft_bounces') or 0)
        hard_bounces = int(summary.get('hard_bounces') or 0)
        blocked = int(summary.get('blocked') or 0)
        invalid_emails = int(summary.get('invalid_emails') or 0)
        spam_reports = int(summary.get('spam_reports') or 0)
        issues = soft_bounces + hard_bounces + blocked + invalid_emails + spam_reports
        device_total = sum(int(row['count']) for row in device_rows)

        return {
            "scope": "new_comer_funnel",
            "scopeLabel": "New Comer Funnel only",
            "source": "Airtable events",
            "periodDays": days,
            "totalTags": 0,
            "syncedTags": 0,
            "backfillComplete": False,
            "sent": 0,
            "delivered": 0,
            "uniqueOpens": unique_opens,
            "uniqueClicks": click_events,
            "clickEvents": click_events,
            "deliveryRatePct": 0,
            "openRatePct": 0,
            "clickRatePct": 0,
            "clickToOpenActivityPct": round((click_events / unique_opens) * 100, 1) if unique_opens else 0,
            "bounceRatePct": 0,
            "deliveryIssues": issues,
            "softBounces": soft_bounces,
            "hardBounces": hard_bounces,
            "blocked": blocked,
            "invalidEmails": invalid_emails,
            "spamReports": spam_reports,
            "unsubscribes": int(summary.get('unsubscribes') or 0),
            "deviceMix": [
                {
                    "device": row['device'],
                    "count": int(row['count']),
                    "percentage": round((int(row['count']) / device_total) * 100, 1) if device_total else 0,
                }
                for row in device_rows
            ],
            "trend": [
                {
                    "date": row['date'],
                    "sent": 0,
                    "delivered": 0,
                    "opens": int(row['opens'] or 0),
                    "clicks": int(row['clicks'] or 0),
                    "issues": int(row['issues'] or 0),
                }
                for row in trend_rows
            ],
            "rateBasis": "event_counts",
            "rateNotice": "Sent and delivered totals are not available yet; no delivery or open rate is shown.",
            "lastSyncedAt": None,
        }

    # ==========================================
    # SHARED VIEWS
    # ==========================================

    def create_shared_view(self, configuration: Dict[str, Any], created_by: Optional[str] = None) -> str:
        """
        Create a new shared view configuration and return the token.
        """
        query = """
            INSERT INTO analytics_shared_views (configuration, created_by)
            VALUES (%s, %s)
            RETURNING token
        """
        
        # Ensure configuration is JSON serializable (psycopg2 handles dict as jsonb automatically)
        result = self._execute_one(query, (psycopg2.extras.Json(configuration), created_by))
        
        if result and 'token' in result:
            return str(result['token'])
        raise Exception("Failed to create shared view")

    def get_shared_view(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Get a shared view configuration by token.
        """
        query = """
            SELECT configuration, is_active
            FROM analytics_shared_views
            WHERE token = %s
        """
        
        # We need to cast token to UUID in the query if it's passed as string, 
        # but psycopg2 usually handles it if the column is UUID.
        # However, to be safe against invalid UUID strings, we should try/catch or validate.
        try:
            result = self._execute_one(query, (token,))
            
            if result and result['is_active']:
                return result['configuration']
            return None
        except Exception as e:
            print(f"Error fetching shared view {token}: {e}")
            return None

    def close(self):
        """Close database connection"""
        if self._pool:
            self._pool.closeall()


# Singleton instance
_supabase_service_instance = None

def get_supabase_service() -> SupabaseService:
    """Get or create SupabaseService singleton instance"""
    global _supabase_service_instance
    if _supabase_service_instance is None:
        _supabase_service_instance = SupabaseService()
    return _supabase_service_instance
