import pytest

from backend.app.services.airtable_service import AirtableService


class FakeDonorsTable:
    def __init__(self):
        self.record = {
            "id": "rec12345678901234",
            "fields": {
                "Name": "Casey",
                "Last Name": "Example",
                "Emails": [],
                "Stage": "Pending Approval",
                "Status": "New",
                "Region": "USA",
            },
        }
        self.last_changes = None
        self.last_typecast = None

    def get(self, record_id):
        assert record_id == self.record["id"]
        return self.record

    def update(self, record_id, changes, typecast=False):
        assert record_id == self.record["id"]
        self.last_changes = changes
        self.last_typecast = typecast
        self.record = {
            **self.record,
            "fields": {**self.record["fields"], **changes},
        }
        return self.record


@pytest.fixture
def service():
    instance = object.__new__(AirtableService)
    instance.donors_table = FakeDonorsTable()
    instance._email_map_for_donors = lambda records: {}
    return instance


def test_approve_changes_only_stage(service):
    result = service.update_funnel_review("rec12345678901234", "approve")

    assert service.donors_table.last_changes == {"Stage": "Funnel"}
    assert service.donors_table.last_typecast is False
    assert result["stage"] == "Funnel"
    assert result["status"] == "New"


def test_potential_duplicate_changes_only_status(service):
    result = service.update_funnel_review(
        "rec12345678901234", "potential_duplicate"
    )

    assert service.donors_table.last_changes == {"Status": "Potential Duplicate"}
    assert result["stage"] == "Pending Approval"
    assert result["status"] == "Potential Duplicate"


def test_change_stage_rejects_unknown_airtable_option(service):
    with pytest.raises(ValueError, match="Invalid donor stage"):
        service.update_funnel_review(
            "rec12345678901234", "change_stage", "Invented by the app"
        )

    assert service.donors_table.last_changes is None
