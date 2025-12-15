"""
Email Sender Supabase Service
Provides database operations for email campaigns using Supabase
"""
import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()


class EmailSenderService:
    """Service for email campaign database operations"""
    
    def __init__(self):
        self.db_url = os.getenv("SUPABASE_DATABASE_URL")
        if not self.db_url:
            raise ValueError("SUPABASE_DATABASE_URL not found in environment variables")
    
    def _get_connection(self):
        """Get a database connection"""
        return psycopg2.connect(self.db_url)
    
    def _execute_query(self, query: str, params: tuple = None) -> List[Dict]:
        """Execute query and return results as list of dicts"""
        conn = self._get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)
                results = cur.fetchall()
                return [dict(row) for row in results]
        finally:
            conn.close()
    
    def _execute_one(self, query: str, params: tuple = None) -> Optional[Dict]:
        """Execute query and return single result"""
        results = self._execute_query(query, params)
        return results[0] if results else None
    
    def _execute_modify(self, query: str, params: tuple = None) -> None:
        """Execute insert/update/delete query"""
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(query, params)
            conn.commit()
        finally:
            conn.close()
    
    # ==================== CRUD Operations ====================
    
    def create_campaign(self, campaign_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new campaign in the database"""
        conn = self._get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Convert sender_config to JSON string if it's a list
                sender_config = campaign_data.get('sender_config', 'all')
                if isinstance(sender_config, list):
                    sender_config = json.dumps(sender_config)
                elif isinstance(sender_config, str):
                    sender_config = json.dumps(sender_config)
                
                # Handle scheduled_at
                scheduled_at = campaign_data.get('scheduled_at')
                status = 'Scheduled' if scheduled_at else 'Draft'
                
                cur.execute("""
                    INSERT INTO email_sender_campaigns (
                        id, campaign_name, source_type, subject, html_body,
                        region, is_bounced, sender_config, status, scheduled_at,
                        target_count, created_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW()
                    ) RETURNING *
                """, (
                    campaign_data['id'],
                    campaign_data['campaign_name'],
                    campaign_data['source_type'],
                    campaign_data.get('subject', ''),
                    campaign_data.get('html_body', ''),
                    campaign_data.get('region'),
                    campaign_data.get('is_bounced', False),
                    sender_config,
                    status,
                    scheduled_at,
                    campaign_data.get('target_count', 0)
                ))
                result = cur.fetchone()
            conn.commit()
            return dict(result) if result else None
        finally:
            conn.close()
    
    def get_campaign(self, campaign_id: str) -> Optional[Dict[str, Any]]:
        """Get a campaign by ID"""
        result = self._execute_one("""
            SELECT * FROM email_sender_campaigns WHERE id = %s
        """, (campaign_id,))
        if result:
            # Parse sender_config from JSON if needed
            if result.get('sender_config'):
                try:
                    result['sender_config'] = json.loads(result['sender_config'])
                except (json.JSONDecodeError, TypeError):
                    pass
            if result.get('mapping'):
                try:
                    result['mapping'] = json.loads(result['mapping'])
                except (json.JSONDecodeError, TypeError):
                    pass
        return result
    
    def list_campaigns(self) -> List[Dict[str, Any]]:
        """List all campaigns ordered by creation date (newest first)"""
        results = self._execute_query("""
            SELECT * FROM email_sender_campaigns 
            ORDER BY created_at DESC
        """)
        for result in results:
            # Parse JSON fields
            if result.get('sender_config'):
                try:
                    result['sender_config'] = json.loads(result['sender_config'])
                except (json.JSONDecodeError, TypeError):
                    pass
            if result.get('mapping'):
                try:
                    result['mapping'] = json.loads(result['mapping'])
                except (json.JSONDecodeError, TypeError):
                    pass
        return results
    
    def update_campaign(self, campaign_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a campaign"""
        conn = self._get_connection()
        try:
            # Build SET clause dynamically
            set_parts = []
            values = []
            
            field_mapping = {
                'status': 'status',
                'csv_filename': 'csv_filename',
                'mapping': 'mapping',
                'target_count': 'target_count',
                'sent_count_final': 'sent_count_final',
                'completed_at': 'completed_at',
                'last_updated': 'last_updated',
                'scheduled_at': 'scheduled_at'
            }
            
            for key, db_field in field_mapping.items():
                if key in updates:
                    value = updates[key]
                    # Serialize dicts/lists to JSON
                    if isinstance(value, (dict, list)):
                        value = json.dumps(value)
                    set_parts.append(f"{db_field} = %s")
                    values.append(value)
            
            if not set_parts:
                return self.get_campaign(campaign_id)
            
            # Always update last_updated
            set_parts.append("last_updated = NOW()")
            
            values.append(campaign_id)
            query = f"UPDATE email_sender_campaigns SET {', '.join(set_parts)} WHERE id = %s RETURNING *"
            
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, tuple(values))
                result = cur.fetchone()
            conn.commit()
            return dict(result) if result else None
        finally:
            conn.close()
    
    def delete_campaign(self, campaign_id: str) -> bool:
        """Delete a campaign by ID"""
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM email_sender_campaigns WHERE id = %s", (campaign_id,))
                deleted = cur.rowcount > 0
            conn.commit()
            return deleted
        finally:
            conn.close()
    
    # ==================== Scheduling Operations ====================
    
    def get_pending_scheduled_campaigns(self) -> List[Dict[str, Any]]:
        """Get campaigns that are scheduled and ready to launch"""
        return self._execute_query("""
            SELECT * FROM email_sender_campaigns 
            WHERE status = 'Scheduled' 
              AND scheduled_at IS NOT NULL 
              AND scheduled_at <= NOW()
            ORDER BY scheduled_at ASC
        """)
    
    def mark_campaign_launching(self, campaign_id: str) -> Optional[Dict[str, Any]]:
        """Mark a campaign as launching (prevents duplicate launches)"""
        return self.update_campaign(campaign_id, {'status': 'Sending'})


# Singleton instance
_email_sender_service_instance = None

def get_email_sender_service() -> EmailSenderService:
    """Get singleton instance of EmailSenderService"""
    global _email_sender_service_instance
    if _email_sender_service_instance is None:
        try:
            _email_sender_service_instance = EmailSenderService()
            print("✅ EmailSenderService initialized")
        except Exception as e:
            print(f"❌ Error initializing EmailSenderService: {e}")
            raise
    return _email_sender_service_instance
