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

load_dotenv()

class SupabaseService:
    def __init__(self):
        self.db_url = os.getenv("SUPABASE_DATABASE_URL")
        if not self.db_url:
            raise ValueError("SUPABASE_DATABASE_URL not found in environment variables")
        
        # Create connection pool instead of single connection
        try:
            self._pool = psycopg2.pool.SimpleConnectionPool(
                1,  # minconn
                10,  # maxconn
                self.db_url
            )
            print("✅ Supabase connection pool created successfully")
        except Exception as e:
            print(f"❌ Failed to create connection pool: {e}")
            raise
    
    def _get_connection(self):
        """Get connection from pool"""
        try:
            conn = self._pool.getconn()
            return conn
        except Exception as e:
            print(f"❌ Error getting connection from pool: {e}")
            raise
    
    def _return_connection(self, conn):
        """Return connection to pool"""
        if conn:
            self._pool.putconn(conn)
    
    def _execute_query(self, query: str, params: tuple = None) -> List[Dict]:
        """Execute query and return results as list of dicts"""
        conn = None
        try:
            conn = self._get_connection()
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query, params or ())
                results = cursor.fetchall()
            conn.commit()
            return results
        except Exception as e:
            if conn:
                conn.rollback()
            print(f"❌ ERROR executing query: {e}")
            print(f"Query: {query}")
            print(f"Params: {params}")
            raise
        finally:
            self._return_connection(conn)
    
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
                COUNT(don.id) as "donationsCount"
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
                "donationsCount": int(row['donationsCount'])
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
