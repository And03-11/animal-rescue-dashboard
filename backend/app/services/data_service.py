import os
from typing import Dict, Any, List, Optional
from datetime import date
from backend.app.services.supabase_service import get_supabase_service, SupabaseService
from backend.app.services.airtable_service import get_airtable_service, AirtableService

class DataService:
    def __init__(self):
        self.supabase: SupabaseService = get_supabase_service()
        self.airtable: AirtableService = get_airtable_service()

    def get_daily_summaries(self, start_date: date, end_date: date) -> List[Dict[str, Any]]:
        """
        Fetches daily summaries from Supabase, falling back to Airtable on error.
        """
        try:
            print("Attempting to fetch daily summaries from Supabase...")
            return self.supabase.get_daily_summaries(start_date, end_date)
        except Exception as e:
            print(f"⚠️ Supabase Error (get_daily_summaries): {e}")
            print("Falling back to Airtable...")
            return self.airtable.get_daily_summaries(start_date, end_date)

    def get_top_donors(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Fetches top donors from Supabase, falling back to Airtable on error.
        """
        try:
            print("Attempting to fetch top donors from Supabase...")
            return self.supabase.get_top_donors_stats(limit)
        except Exception as e:
            print(f"⚠️ Supabase Error (get_top_donors): {e}")
            print("Falling back to Airtable...")
            # Airtable implementation requires fetching all donations and processing in Python
            # The existing endpoint logic did this manually using airtable_service.get_donations_with_donor_info()
            # We can replicate that logic here or call a method on airtable_service if we move it there.
            # For now, let's assume we use the service method that returns raw data and process it, 
            # OR better, we can move the processing logic into AirtableService to match the interface.
            # However, looking at the existing code in dashboard.py, it calls `get_donations_with_donor_info` 
            # and then processes it. 
            # To keep DataService clean, we should probably implement `get_top_donors_stats` in AirtableService too 
            # or handle the difference here.
            
            # Let's rely on the existing logic in dashboard.py which we are moving here?
            # Actually, the plan was to have DataService provide a unified interface.
            # So we should implement the aggregation logic for Airtable HERE or in AirtableService.
            # Let's implement it here using the raw Airtable data to match the Supabase output.
            
            all_donations = self.airtable.get_donations_with_donor_info()
            from collections import defaultdict
            donor_stats = defaultdict(lambda: {"totalAmount": 0, "donationsCount": 0, "name": ""})

            for donation in all_donations:
                email = donation.get("email")
                if not email: continue
                
                amount = donation.get("amount", 0)
                donor_stats[email]["totalAmount"] += amount
                donor_stats[email]["donationsCount"] += 1
                if not donor_stats[email]["name"] or donor_stats[email]["name"] == "Anonymous":
                     donor_stats[email]["name"] = donation.get("name", "Anonymous")

            top_donors_list = [
                {"email": email, **stats} for email, stats in donor_stats.items()
            ]
            sorted_donors = sorted(top_donors_list, key=lambda x: x["totalAmount"], reverse=True)
            return sorted_donors[:limit]

    def get_monthly_source_breakdown(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """
        Fetches source breakdown from Supabase, falling back to Airtable.
        """
        try:
            print("Attempting to fetch source breakdown from Supabase...")
            # We need to implement this in SupabaseService
            return self.supabase.get_monthly_source_breakdown(start_date, end_date)
        except Exception as e:
            print(f"⚠️ Supabase Error (get_monthly_source_breakdown): {e}")
            print("Falling back to Airtable...")
            return self.airtable.get_monthly_source_breakdown(start_date, end_date)

    def get_source_stats(self, source_name: str, start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, Any]:
        """
        Fetches source stats from Supabase, falling back to Airtable.
        """
        try:
            print("Attempting to fetch source stats from Supabase...")
            return self.supabase.get_source_stats(source_name, start_date, end_date)
        except Exception as e:
            print(f"⚠️ Supabase Error (get_source_stats): {e}")
            print("Falling back to Airtable...")
            return self.airtable.get_source_stats(source_name, start_date, end_date)

    def get_campaign_stats(self, campaign_id: str, start_date: Optional[str] = None, end_date: Optional[str] = None, form_title_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Fetches campaign stats from Supabase, falling back to Airtable.
        """
        try:
            print("Attempting to fetch campaign stats from Supabase...")
            return self.supabase.get_campaign_stats(campaign_id, start_date, end_date, form_title_ids)
        except Exception as e:
            print(f"⚠️ Supabase Error (get_campaign_stats): {e}")
            print("Falling back to Airtable...")
            return self.airtable.get_campaign_stats(campaign_id, start_date, end_date, form_title_ids)

    def get_campaign_donations(self, campaign_id: str, start_date: Optional[str] = None, end_date: Optional[str] = None, page_size: int = 50, offset: int = 0) -> Dict[str, Any]:
        """
        Fetches campaign donations from Supabase, falling back to Airtable.
        """
        try:
            print("Attempting to fetch campaign donations from Supabase...")
            return self.supabase.get_campaign_donations(campaign_id, start_date, end_date, page_size, offset)
        except Exception as e:
            print(f"⚠️ Supabase Error (get_campaign_donations): {e}")
            print("Falling back to Airtable...")
            return self.airtable.get_campaign_donations(campaign_id, start_date, end_date, page_size, offset)

    def get_campaigns_by_source(self, source: str) -> List[Dict[str, Any]]:
        """
        Fetches campaigns by source from Supabase (not implemented yet in SupabaseService?), falling back to Airtable.
        """
        # TODO: Implement get_campaigns in SupabaseService if needed. For now, fallback to Airtable or implement if easy.
        # SupabaseService doesn't seem to have get_campaigns yet.
        # Let's check SupabaseService again or just fallback for now.
        # Actually, let's implement it in SupabaseService too for completeness, but for now let's just fallback if not present.
        # But wait, DataService should try Supabase first.
        # Let's assume we will add it to SupabaseService or just use Airtable for this one if it's low priority.
        # Given the user's request "why is it using airtable", we should try to move EVERYTHING.
        # I'll add get_campaigns to SupabaseService in the next step.
        try:
            print("Attempting to fetch campaigns from Supabase...")
            # Assuming we will add this method to SupabaseService
            return self.supabase.get_campaigns(source)
        except Exception as e:
            print(f"⚠️ Supabase Error (get_campaigns): {e}")
            print("Falling back to Airtable...")
            return self.airtable.get_campaigns(source)

    def get_unique_campaign_sources(self) -> List[str]:
        """
        Fetches unique sources.
        """
        try:
            print("Attempting to fetch unique sources from Supabase...")
            return self.supabase.get_unique_campaign_sources()
        except Exception as e:
            print(f"⚠️ Supabase Error (get_unique_campaign_sources): {e}")
            print("Falling back to Airtable...")
            return self.airtable.get_unique_campaign_sources()

    def get_donations_for_form_title(self, form_title_ids: List[str], start_date: Optional[str] = None, end_date: Optional[str] = None, page_size: int = 50, offset: int = 0) -> Dict[str, Any]:
        """
        Fetches donations for form title from Supabase, falling back to Airtable.
        """
        try:
            print("Attempting to fetch form title donations from Supabase...")
            return self.supabase.get_donations_for_form_title(form_title_ids, start_date, end_date, page_size, offset)
        except Exception as e:
            print(f"⚠️ Supabase Error (get_donations_for_form_title): {e}")
            print("Falling back to Airtable...")
            return self.airtable.get_donations_for_form_title(form_title_ids, start_date, end_date, page_size, offset)

# Singleton
_data_service_instance = None

def get_data_service() -> DataService:
    global _data_service_instance
    if _data_service_instance is None:
        _data_service_instance = DataService()
    return _data_service_instance
