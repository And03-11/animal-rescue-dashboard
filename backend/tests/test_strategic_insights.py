from backend.app.services.supabase_service import SupabaseService


def test_strongest_weekday_includes_zero_revenue_calendar_days():
    service = object.__new__(SupabaseService)
    executed_queries: list[str] = []

    def execute_one(query: str, *_args, **_kwargs):
        executed_queries.append(query)
        if "WITH calendar_days" in query:
            return {
                "weekday": "Sunday",
                "average_daily_amount": 3200,
                "average_daily_donations": 64,
            }
        if "WITH donor_totals" in query:
            return {}
        if "FROM campaigns c" in query:
            return {}
        return {}

    service._execute_one = execute_one

    result = service.get_strategic_insights()
    timing_query = next(query for query in executed_queries if "WITH calendar_days" in query)

    assert "GENERATE_SERIES" in timing_query
    assert "LEFT JOIN daily_metrics" in timing_query
    assert "COALESCE(daily_metrics.total_amount, 0)" in timing_query
    assert result["timing"] == {
        "periodDays": 90,
        "bestWeekday": "Sunday",
        "averageDailyAmount": 3200.0,
        "averageDailyDonations": 64.0,
    }
