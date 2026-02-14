"""
Email Scheduler Worker
Uses APScheduler to check for pending scheduled campaigns and launch them automatically.
"""
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime
import traceback

# Import will be done at runtime to avoid circular imports
_scheduler: AsyncIOScheduler = None


def get_scheduler() -> AsyncIOScheduler:
    """Get the scheduler instance"""
    global _scheduler
    return _scheduler


async def check_and_launch_scheduled_campaigns():
    """
    Check for campaigns with status='Scheduled' and scheduled_at <= now.
    Launch each one by calling the existing run_campaign_task.
    """
    try:
        # Import here to avoid circular imports
        from backend.app.services.email_sender_service import get_email_sender_service
        from backend.app.api.v1.endpoints.email_sender import run_campaign_task
        
        service = get_email_sender_service()
        pending = service.get_pending_scheduled_campaigns()
        
        if not pending:
            return
        
        print(f"[Scheduler Worker] Found {len(pending)} campaigns ready to launch")
        
        for campaign in pending:
            campaign_id = campaign['id']
            try:
                print(f"[Scheduler Worker] Launching campaign: {campaign_id}")
                
                # Mark as launching first (prevents duplicate launches)
                service.mark_campaign_launching(campaign_id)
                
                # Run the campaign task in a thread to not block
                # Since run_campaign_task is synchronous, we run it in executor
                loop = asyncio.get_event_loop()
                loop.run_in_executor(None, run_campaign_task, campaign_id)
                
                print(f"[Scheduler Worker] Campaign {campaign_id} launch initiated")
                
            except Exception as e:
                print(f"[Scheduler Worker] Error launching {campaign_id}: {e}")
                traceback.print_exc()
                
    except Exception as e:
        print(f"[Scheduler Worker] Error in check_and_launch: {e}")
        traceback.print_exc()


async def run_data_sync():
    """
    Run the Airtable -> Supabase synchronization.
    Runs in an executor because it's synchronous.
    """
    print("[Scheduler Worker] 🔄 Starting Data Sync (Airtable -> Supabase)...")
    try:
        from backend.app.scripts.incremental_sync import run_sync
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, run_sync)
        
        print("[Scheduler Worker] ✅ Data Sync finished successfully")
    except Exception as e:
        print(f"[Scheduler Worker] ❌ Error in Data Sync: {e}")
        traceback.print_exc()


def init_scheduler():
    """Initialize the APScheduler"""
    global _scheduler
    
    if _scheduler is not None:
        print("[Scheduler Worker] Scheduler already initialized")
        return _scheduler
    
    _scheduler = AsyncIOScheduler()
    
    # 1. Email Campaign Check (Every 1 minute)
    _scheduler.add_job(
        check_and_launch_scheduled_campaigns,
        trigger=IntervalTrigger(minutes=1),
        id='email_scheduler_check',
        name='Check for scheduled email campaigns',
        replace_existing=True,
        max_instances=1
    )
    
    # 2. Data Sync (Every 10 minutes) - INCREMENTAL
    _scheduler.add_job(
        run_data_sync,
        trigger=IntervalTrigger(minutes=10),
        id='data_sync_job',
        name='Sync Airtable to Supabase (Incremental)',
        replace_existing=True,
        max_instances=1
    )
    
    print("[Scheduler Worker] ✅ Scheduler initialized (Emails: 1min, Sync: 10min)")
    return _scheduler


def start_scheduler():
    """Start the scheduler"""
    global _scheduler
    if _scheduler is None:
        init_scheduler()
    
    if not _scheduler.running:
        _scheduler.start()
        print("[Scheduler Worker] ✅ Scheduler started")
    else:
        print("[Scheduler Worker] Scheduler already running")


def stop_scheduler():
    """Stop the scheduler"""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown()
        print("[Scheduler Worker] Scheduler stopped")
