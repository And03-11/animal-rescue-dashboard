# Email Campaign Wizard and Multi-Audience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long campaign form with a three-step wizard and let Airtable campaigns target any non-empty subset of the four USA/EUR × Valid/Bounced branches while keeping Donors/Not Donors exclusive.

**Architecture:** Store Airtable branches as an explicit normalized `audiences` list, query them through one composed Airtable formula, and preserve legacy `region/is_bounced` reads. A side-effect-free preview endpoint validates selection and returns per-branch and unique counts; the frontend wizard consumes that contract and keeps CSV behavior intact.

**Tech Stack:** Python 3.13, FastAPI, Pydantic, pytest, psycopg2/PostgreSQL JSONB, Airtable formula API, React 19, TypeScript 5.8, Material UI 7, Node 22 test runner, Vite 6.

**Spec:** `docs/superpowers/specs/2026-08-24-email-campaign-wizard-audiences-design.md`

## Global Constraints

- Airtable exposes exactly four selectable branches: USA Valid, USA Bounced, EUR Valid, and EUR Bounced.
- A campaign selects between one and four unique branches; arbitrary subsets are valid.
- `standard` (Not Donors) and `dnr` (Donors) remain mutually exclusive and apply to every selected branch.
- Normalize recipient emails with `strip().lower()` and send at most once per campaign.
- New writes use `audiences`; existing `region/is_bounced` campaigns must still edit and execute.
- Re-query Airtable at send time; preview data is informative rather than a frozen recipient snapshot.
- A zero-recipient campaign may be saved as Draft but cannot be scheduled or launched.
- Preserve the complete CSV upload, preview, mapping, editing, and send flow.
- Do not implement open/click tracking or saved audience presets in this change.
- Add no frontend runtime or test dependencies; use the existing Node test runner, ESLint, TypeScript, and Vite.
- Follow strict TDD for pure logic and backend behavior: observe RED, add minimal implementation, then observe GREEN.

---

## File Map

### Backend

- Create `backend/app/services/campaign_audiences.py`: normalized audience domain types, legacy fallback, contact deduplication.
- Modify `backend/app/services/airtable_service.py`: composed branch query and preview/count resolution.
- Modify `backend/app/api/v1/endpoints/email_sender.py`: request models, preview endpoint, create/update/launch integration.
- Modify `backend/app/services/campaign_storage.py`: include audiences and segment in list summaries.
- Modify `backend/app/services/email_sender_service.py`: persist JSONB audiences and segment in PostgreSQL.
- Modify `backend/app/scripts/create_email_sender_table.py`: idempotent schema migration.
- Create `backend/tests/test_campaign_audiences.py`: domain normalization and deduplication.
- Create `backend/tests/test_airtable_campaign_audiences.py`: composed formula, counts, and Airtable failures.
- Modify `backend/tests/test_email_sender_campaign_writes.py`: preview/create/update contracts and compatibility.
- Modify `backend/tests/test_email_sender_campaign_storage.py`: list summary projection.
- Modify `backend/tests/test_email_sender_execution_safety.py`: legacy/new execution and zero-target protection.
- Create `backend/tests/test_email_sender_service_audiences.py`: SQL persistence contract.

### Frontend

- Modify `frontend/src/features/email-sender/types.ts`: audience, preview, wizard, campaign detail types.
- Create `frontend/src/features/email-sender/audienceSelection.ts`: selection shortcuts, normalization, legacy hydration, summaries.
- Create `frontend/src/features/email-sender/campaignWizardState.ts`: step validation, preview invalidation, payload construction.
- Create `frontend/src/features/email-sender/CampaignWizard.tsx`: modal orchestration and async workflow.
- Create `frontend/src/features/email-sender/AudienceStep.tsx`: Airtable matrix, shortcuts, segment, CSV block, counts.
- Create `frontend/src/features/email-sender/CampaignSetupStep.tsx`: senders, name, subject, schedule.
- Create `frontend/src/features/email-sender/ContentReviewStep.tsx`: templates, editor/preview, send test, review summary.
- Create `frontend/src/features/email-sender/audiencePresentation.ts`: compact table label and detail text.
- Modify `frontend/src/features/email-sender/CampaignTableWorkspace.tsx`: render multi-audience summaries.
- Modify `frontend/src/pages/EmailSenderPage.tsx`: replace inline `CampaignForm` with `CampaignWizard`.
- Create `frontend/tests/audienceSelection.test.ts`: branch and shortcut behavior.
- Create `frontend/tests/campaignWizardState.test.ts`: step validation and payload behavior.
- Create `frontend/tests/audiencePresentation.test.ts`: table labels.

---

### Task 1: Audience Domain Model and Legacy Normalization

**Files:**
- Create: `backend/app/services/campaign_audiences.py`
- Create: `backend/tests/test_campaign_audiences.py`

**Interfaces:**
- Consumes: raw JSON-like audience mappings and optional legacy `region/is_bounced`.
- Produces: `AudienceBranch`, `AudienceCount`, `AudienceResolution`, `normalize_audiences(...)`, `serialize_audiences(...)`, and `deduplicate_contacts(...)`.

- [ ] **Step 1: Write failing normalization and deduplication tests**

```python
def test_normalizes_arbitrary_unique_branch_subset():
    branches = normalize_audiences([
        {"region": "EUR", "is_bounced": True},
        {"region": "USA", "is_bounced": False},
    ])
    assert serialize_audiences(branches) == [
        {"region": "USA", "is_bounced": False},
        {"region": "EUR", "is_bounced": True},
    ]


def test_legacy_filter_becomes_one_branch():
    branches = normalize_audiences(None, legacy_region="EUR", legacy_is_bounced=False)
    assert serialize_audiences(branches) == [
        {"region": "EUR", "is_bounced": False}
    ]


def test_rejects_duplicates_and_invalid_regions():
    with pytest.raises(ValueError, match="Audience branches must be unique"):
        normalize_audiences([
            {"region": "USA", "is_bounced": False},
            {"region": "USA", "is_bounced": False},
        ])
    with pytest.raises(ValueError, match="Unsupported audience region"):
        normalize_audiences([{"region": "LATAM", "is_bounced": False}])


def test_deduplicates_email_case_and_outer_whitespace():
    contacts = deduplicate_contacts([
        {"Email": " One@example.org ", "Name": "One"},
        {"Email": "one@EXAMPLE.org", "Name": "Duplicate"},
        {"Email": "two@example.org", "Name": "Two"},
    ])
    assert contacts == (
        {"Email": "One@example.org", "Name": "One"},
        {"Email": "two@example.org", "Name": "Two"},
    )
```

- [ ] **Step 2: Run the domain tests and verify RED**

Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_campaign_audiences.py -q`

Expected: collection fails because `backend.app.services.campaign_audiences` does not exist.

- [ ] **Step 3: Implement the normalized domain model**

```python
from dataclasses import dataclass
from typing import Any, Iterable, Literal, Mapping

AudienceRegion = Literal["USA", "EUR"]
AudienceSegment = Literal["standard", "dnr"]


@dataclass(frozen=True, order=True)
class AudienceBranch:
    region: AudienceRegion
    is_bounced: bool


@dataclass(frozen=True)
class AudienceCount:
    region: AudienceRegion
    is_bounced: bool
    count: int


@dataclass(frozen=True)
class AudienceResolution:
    contacts: tuple[dict[str, str], ...]
    branches: tuple[AudienceCount, ...]

    @property
    def total_unique(self) -> int:
        return len(self.contacts)


def normalize_audiences(
    raw_audiences: Iterable[Mapping[str, Any]] | None,
    *,
    legacy_region: str | None = None,
    legacy_is_bounced: bool | None = None,
) -> tuple[AudienceBranch, ...]:
    source = list(raw_audiences or [])
    if not source and legacy_region is not None and legacy_is_bounced is not None:
        source = [{"region": legacy_region, "is_bounced": legacy_is_bounced}]
    if not 1 <= len(source) <= 4:
        raise ValueError("Airtable campaigns require between 1 and 4 audience branches")
    branches: list[AudienceBranch] = []
    for item in source:
        region = item.get("region")
        if region not in {"USA", "EUR"}:
            raise ValueError(f"Unsupported audience region: {region}")
        is_bounced = item.get("is_bounced")
        if not isinstance(is_bounced, bool):
            raise ValueError("Audience is_bounced must be a boolean")
        branches.append(AudienceBranch(region=region, is_bounced=is_bounced))
    if len(set(branches)) != len(branches):
        raise ValueError("Audience branches must be unique")
    return tuple(sorted(branches, key=lambda item: (item.region != "USA", item.is_bounced)))
```

Implement `serialize_audiences` as a deterministic list of dictionaries and `deduplicate_contacts` as first-contact-wins after `strip().lower()` normalization. Ignore missing or blank emails.

- [ ] **Step 4: Run the domain tests and verify GREEN**

Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_campaign_audiences.py -q`

Expected: all tests pass.

- [ ] **Step 5: Commit the audience domain model**

```powershell
git add backend/app/services/campaign_audiences.py backend/tests/test_campaign_audiences.py
git commit -m "feat: add campaign audience domain model"
```

---

### Task 2: Composed Airtable Audience Query

**Files:**
- Modify: `backend/app/services/airtable_service.py:982-1085`
- Create: `backend/tests/test_airtable_campaign_audiences.py`

**Interfaces:**
- Consumes: normalized `tuple[AudienceBranch, ...]` and segment `standard | dnr` from Task 1.
- Produces: `AirtableService.resolve_campaign_audiences(audiences, segment) -> AudienceResolution`.
- Preserves: `get_campaign_contacts(region, is_bounced, segment) -> list[dict]` as a legacy adapter.

- [ ] **Step 1: Write failing tests with a capturing Airtable table**

```python
class CapturingTable:
    def __init__(self, records):
        self.records = records
        self.calls = []

    def all(self, **kwargs):
        self.calls.append(kwargs)
        return self.records


def test_resolves_two_branches_with_one_or_formula():
    table = CapturingTable([
        {"fields": {"Email": "usa@example.org", "Name": ["Una"], "Region": "USA", "Bounced Account": False}},
        {"fields": {"Email": "eur@example.org", "Name": ["Eva"], "Region": "EUR", "Bounced Account": True}},
    ])
    service = AirtableService.__new__(AirtableService)
    service.emails_table = table
    result = service.resolve_campaign_audiences(
        normalize_audiences([
            {"region": "USA", "is_bounced": False},
            {"region": "EUR", "is_bounced": True},
        ]),
        "standard",
    )
    formula = table.calls[0]["formula"]
    assert len(table.calls) == 1
    assert "OR(" in formula
    assert "{Region} = 'USA'" in formula
    assert "{Region} = 'EUR'" in formula
    assert result.total_unique == 2
    assert [branch.count for branch in result.branches] == [1, 1]
```

Add tests proving `standard` applies `NOT({Exclude From Current Campaign} = 1)`, `dnr` applies equality, duplicate email records count once in `total_unique`, and Airtable exceptions raise `AirtableCampaignQueryError` instead of returning an empty list.

- [ ] **Step 2: Run the Airtable tests and verify RED**

Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_airtable_campaign_audiences.py -q`

Expected: failures because `resolve_campaign_audiences` and `AirtableCampaignQueryError` do not exist.

- [ ] **Step 3: Implement one composed query and legacy adapter**

```python
class AirtableCampaignQueryError(RuntimeError):
    pass


def _branch_formula(region_field: str, bounced_field: str, branch: AudienceBranch) -> str:
    bounced_clause = (
        f"{{{bounced_field}}} = 1"
        if branch.is_bounced
        else f"NOT({{{bounced_field}}} = 1)"
    )
    return f"AND({{{region_field}}} = '{branch.region}', {bounced_clause})"


def resolve_campaign_audiences(
    self,
    audiences: tuple[AudienceBranch, ...],
    segment: AudienceSegment = "standard",
) -> AudienceResolution:
    if segment not in {"standard", "dnr"}:
        raise ValueError(f"Unsupported audience segment: {segment}")
    region_field = EMAILS_FIELDS.get("region", "Region")
    bounced_field = EMAILS_FIELDS.get("bounced_account", "Bounced Account")
    branch_formula = "OR(" + ", ".join(
        _branch_formula(region_field, bounced_field, branch)
        for branch in audiences
    ) + ")"
```

Append `branch_formula` to the existing common conditions, request Email, Name, Region, and Bounced Account fields, categorize each record into the matching selected branch, and then call `deduplicate_contacts`. Wrap only Airtable access failures in `AirtableCampaignQueryError`; do not convert failures to empty results.

Keep `get_campaign_contacts(region, is_bounced, segment)` by normalizing one legacy branch, calling `resolve_campaign_audiences`, and returning `list(result.contacts)`.

- [ ] **Step 4: Run the Airtable and legacy tests**

Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_airtable_campaign_audiences.py backend/tests/test_email_sender_campaign_writes.py -q`

Expected: all selected tests pass.

- [ ] **Step 5: Commit the Airtable resolver**

```powershell
git add backend/app/services/airtable_service.py backend/tests/test_airtable_campaign_audiences.py
git commit -m "feat: resolve combined Airtable audiences"
```

---

### Task 3: Audience Preview and Campaign API Contracts

**Files:**
- Modify: `backend/app/api/v1/endpoints/email_sender.py:164-187,657-795`
- Modify: `backend/tests/test_email_sender_campaign_writes.py`

**Interfaces:**
- Consumes: `normalize_audiences` and `AirtableService.resolve_campaign_audiences`.
- Produces: `POST /api/v1/sender/audience-preview`, request models, and normalized create/update responses.

- [ ] **Step 1: Extend the fake Airtable service and write failing API tests**

```python
class FakeAirtableService:
    resolution = AudienceResolution(
        contacts=(
            {"Email": "one@example.org", "Name": "One"},
            {"Email": "two@example.org", "Name": "Two"},
        ),
        branches=(
            AudienceCount(region="EUR", is_bounced=False, count=2),
        ),
    )

    def resolve_campaign_audiences(self, audiences, segment):
        self.received = (audiences, segment)
        return self.resolution


def test_audience_preview_returns_branch_and_unique_counts(write_environment):
    response = client.post(
        "/api/v1/sender/audience-preview",
        json={
            "audiences": [{"region": "EUR", "is_bounced": False}],
            "segment": "standard",
        },
    )
    assert response.status_code == 200
    assert response.json() == {
        "branches": [{"region": "EUR", "is_bounced": False, "count": 2}],
        "total_unique": 2,
    }
```

Add tests for: 1-4 validation, duplicate rejection, 502 on `AirtableCampaignQueryError`, create with multiple audiences, scheduled create rejected when `total_unique == 0`, Draft allowed at zero, legacy create converted to one audience, and update preserving normalized audiences.

- [ ] **Step 2: Run the API tests and verify RED**

Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_email_sender_campaign_writes.py -q`

Expected: preview returns 404 and multi-audience create is not accepted.

- [ ] **Step 3: Add Pydantic models and preview endpoint**

```python
class AudienceBranchRequest(BaseModel):
    region: Literal["USA", "EUR"]
    is_bounced: bool


class AudiencePreviewRequest(BaseModel):
    audiences: list[AudienceBranchRequest] = Field(min_length=1, max_length=4)
    segment: Literal["standard", "dnr"] = "standard"


class CampaignRequest(BaseModel):
    source_type: Literal["airtable", "csv"]
    subject: str
    html_body: str
    campaign_name: str = Field(min_length=1)
    audiences: list[AudienceBranchRequest] | None = None
    region: str | None = None
    is_bounced: bool | None = None
    sender_config: str | list[str] = "all"
    scheduled_at: datetime | None = None
    segment: Literal["standard", "dnr"] = "standard"
```

Use `normalize_audiences` inside a shared endpoint helper so duplicates and legacy fallback use one rule. Return status 422 for invalid audience structure and 502 with `Unable to load Airtable audience. Try again.` for Airtable access failure.

```python
def _request_audiences(
    req: CampaignRequest | CampaignUpdateRequest,
) -> tuple[AudienceBranch, ...]:
    raw_audiences = (
        [audience.model_dump() for audience in req.audiences]
        if req.audiences is not None
        else None
    )
    return normalize_audiences(
        raw_audiences,
        legacy_region=req.region,
        legacy_is_bounced=req.is_bounced,
    )
```

- [ ] **Step 4: Update create and update paths**

Create stores `audiences=serialize_audiences(branches)`, `target_count=resolution.total_unique`, and writes the deduplicated targets. For a single branch, mirror `region/is_bounced`; for multiple branches, set both legacy fields to `None`. Reject scheduled Airtable campaigns with zero recipients. Update accepts audiences, invalidates stale target count, recalculates preview when filters change, and syncs the normalized list remotely.

```python
branches = _request_audiences(req)
resolution = airtable_service.resolve_campaign_audiences(
    branches,
    req.segment,
)
if req.scheduled_at is not None and resolution.total_unique == 0:
    raise HTTPException(
        status_code=422,
        detail="Scheduled campaigns require at least one eligible recipient.",
    )
campaign_config = req.model_dump(exclude={"audiences"})
campaign_config["audiences"] = serialize_audiences(branches)
campaign_config["target_count"] = resolution.total_unique
campaign_config["region"] = branches[0].region if len(branches) == 1 else None
campaign_config["is_bounced"] = (
    branches[0].is_bounced if len(branches) == 1 else None
)
storage.write_target_contacts(campaign_id, resolution.contacts)
```

For update, normalize `req.audiences` when present, resolve the new selection, replace `audiences/target_count/region/is_bounced`, and include those exact fields plus `segment` in the remote update payload.

- [ ] **Step 5: Run API tests and verify GREEN**

Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_email_sender_campaign_writes.py -q`

Expected: all tests pass.

- [ ] **Step 6: Commit the API contract**

```powershell
git add backend/app/api/v1/endpoints/email_sender.py backend/tests/test_email_sender_campaign_writes.py
git commit -m "feat: add audience preview campaign API"
```

---

### Task 4: JSONB Persistence and Campaign Summaries

**Files:**
- Modify: `backend/app/scripts/create_email_sender_table.py:31-64`
- Modify: `backend/app/services/email_sender_service.py:59-184`
- Modify: `backend/app/services/campaign_storage.py:14-32`
- Create: `backend/tests/test_email_sender_service_audiences.py`
- Modify: `backend/tests/test_email_sender_campaign_storage.py`

**Interfaces:**
- Consumes: serialized `audiences: list[dict]` and `segment` from Task 3.
- Produces: idempotent schema migration and summaries that expose both fields.

- [ ] **Step 1: Write failing SQL capture and summary tests**

Use fake connection/cursor objects to capture the `INSERT` and `UPDATE` parameters without a real Supabase connection. Assert JSON serialization for audiences and segment persistence. Extend the campaign storage fixture with:

```python
"audiences": [
    {"region": "USA", "is_bounced": False},
    {"region": "EUR", "is_bounced": True},
],
"segment": "dnr",
```

Assert both fields survive `GET /api/v1/sender/campaigns` while `html_body` remains omitted.

- [ ] **Step 2: Run persistence tests and verify RED**

Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_email_sender_service_audiences.py backend/tests/test_email_sender_campaign_storage.py -q`

Expected: audiences are absent from SQL and campaign summaries.

- [ ] **Step 3: Add the idempotent schema migration**

```sql
ALTER TABLE email_sender_campaigns
ADD COLUMN IF NOT EXISTS audiences JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE email_sender_campaigns
ADD COLUMN IF NOT EXISTS segment VARCHAR(20) NOT NULL DEFAULT 'standard';
```

Run these statements both when the table already exists and include the columns in the new-table definition.

- [ ] **Step 4: Persist audiences and segment**

Add `audiences` and `segment` to the insert column list and values. Serialize `audiences` with `json.dumps`. Add these fields plus editable campaign fields (`campaign_name`, `subject`, `html_body`, `sender_config`, `region`, `is_bounced`) to `field_mapping` in `update_campaign` so the remote mirror matches file storage.

Add `audiences` and `segment` to `CAMPAIGN_SUMMARY_FIELDS`.

```python
audiences_json = json.dumps(campaign_data.get("audiences", []))
segment = campaign_data.get("segment", "standard")

field_mapping = {
    "campaign_name": "campaign_name",
    "subject": "subject",
    "html_body": "html_body",
    "sender_config": "sender_config",
    "region": "region",
    "is_bounced": "is_bounced",
    "audiences": "audiences",
    "segment": "segment",
    "status": "status",
    "csv_filename": "csv_filename",
    "mapping": "mapping",
    "target_count": "target_count",
    "sent_count_final": "sent_count_final",
    "completed_at": "completed_at",
    "last_updated": "last_updated",
    "scheduled_at": "scheduled_at",
}
```

- [ ] **Step 5: Run persistence tests and verify GREEN**

Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_email_sender_service_audiences.py backend/tests/test_email_sender_campaign_storage.py -q`

Expected: all tests pass.

- [ ] **Step 6: Commit persistence changes**

```powershell
git add backend/app/scripts/create_email_sender_table.py backend/app/services/email_sender_service.py backend/app/services/campaign_storage.py backend/tests/test_email_sender_service_audiences.py backend/tests/test_email_sender_campaign_storage.py
git commit -m "feat: persist campaign audience selections"
```

---

### Task 5: Send-Time Refresh, Legacy Execution, and Zero-Target Safety

**Files:**
- Modify: `backend/app/api/v1/endpoints/email_sender.py:192-310` and launch preparation section
- Modify: `backend/tests/test_email_sender_execution_safety.py`

**Interfaces:**
- Consumes: stored `audiences` or legacy `region/is_bounced` and Airtable resolver.
- Produces: fresh deduplicated targets at execution, updated target count, and zero-target launch/schedule protection.

- [ ] **Step 1: Write failing execution tests**

Add tests that store a config with two audiences and assert the mocked resolver receives both plus the global segment. Add a legacy config test asserting one synthesized branch. Add a launch test:

```python
def test_zero_target_airtable_campaign_cannot_launch(campaign_directories):
    campaign_data, _sent_logs, _targets = campaign_directories
    campaign_id = "Campaign_empty"
    (campaign_data / f"{campaign_id}.json").write_text(
        json.dumps({
            "id": campaign_id,
            "source_type": "airtable",
            "audiences": [{"region": "EUR", "is_bounced": False}],
            "segment": "standard",
            "target_count": 0,
            "status": "Draft",
        }),
        encoding="utf-8",
    )
    with pytest.raises(HTTPException) as error:
        email_sender.prepare_campaign_launch(campaign_id)
    assert error.value.status_code == 422
```

- [ ] **Step 2: Run execution tests and verify RED**

Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_email_sender_execution_safety.py -q`

Expected: worker still passes only legacy filters and launch accepts target count zero.

- [ ] **Step 3: Resolve normalized audiences at send time**

In `_run_campaign_task_unlocked`, normalize the stored config, call `resolve_campaign_audiences`, use `list(resolution.contacts)`, and persist `target_count`, `contacts_fetched_at`, normalized `audiences`, and regenerated target CSV. If resolution is empty, set `Error - No Airtable Recipients`, sync status, and exit before loading recipients into the send loop.

```python
branches = normalize_audiences(
    config.get("audiences"),
    legacy_region=config.get("region"),
    legacy_is_bounced=config.get("is_bounced"),
)
resolution = airtable_service.resolve_campaign_audiences(
    branches,
    config.get("segment", "standard"),
)
if resolution.total_unique == 0:
    config["status"] = "Error - No Airtable Recipients"
    storage.save_campaign(campaign_id, config, serialize_unknown=True)
    _sync_remote_campaign_status(campaign_id, config["status"])
    return
contact_data = list(resolution.contacts)
config["audiences"] = serialize_audiences(branches)
config["target_count"] = resolution.total_unique
config["contacts_fetched_at"] = datetime.now().isoformat()
storage.save_campaign(campaign_id, config, serialize_unknown=True)
storage.write_target_contacts(campaign_id, contact_data)
```

- [ ] **Step 4: Enforce scheduling and launch guards**

Reject scheduling when the validated preview count is zero. Reject manual launch when the stored target count is zero with HTTP 422 and detail `Campaign has no eligible recipients. Recalculate the audience before launching.` Preserve existing launch locks and retry semantics.

```python
if (
    config.get("source_type") == "airtable"
    and int(config.get("target_count") or 0) == 0
):
    raise HTTPException(
        status_code=422,
        detail=(
            "Campaign has no eligible recipients. "
            "Recalculate the audience before launching."
        ),
    )
```

- [ ] **Step 5: Run execution and write regression tests**

Run: `backend\venv\Scripts\python.exe -m pytest backend/tests/test_email_sender_execution_safety.py backend/tests/test_email_sender_campaign_writes.py -q`

Expected: all tests pass.

- [ ] **Step 6: Commit execution safety**

```powershell
git add backend/app/api/v1/endpoints/email_sender.py backend/tests/test_email_sender_execution_safety.py backend/tests/test_email_sender_campaign_writes.py
git commit -m "feat: refresh multi-audience contacts at send time"
```

---

### Task 6: Frontend Audience Types, Shortcuts, and Summary Logic

**Files:**
- Modify: `frontend/src/features/email-sender/types.ts`
- Create: `frontend/src/features/email-sender/audienceSelection.ts`
- Create: `frontend/tests/audienceSelection.test.ts`

**Interfaces:**
- Consumes: API contract from Task 3.
- Produces: `AirtableAudience`, `AudienceShortcut`, `AudiencePreview`, `AIRTABLE_AUDIENCES`, `applyAudienceShortcut`, `toggleAudience`, `normalizeAudienceSelection`, `hydrateAudienceSelection`, and `summarizeAudienceSelection`.

- [ ] **Step 1: Write failing shortcut and legacy hydration tests**

```typescript
test('audience shortcuts replace the selection with exact branches', async () => {
  const { applyAudienceShortcut } = await import(
    '../src/features/email-sender/audienceSelection.ts'
  );

  assert.deepEqual(applyAudienceShortcut('EUR'), [
    { region: 'EUR', is_bounced: false },
    { region: 'EUR', is_bounced: true },
  ]);
  assert.deepEqual(applyAudienceShortcut('Valid'), [
    { region: 'USA', is_bounced: false },
    { region: 'EUR', is_bounced: false },
  ]);
  assert.equal(applyAudienceShortcut('All').length, 4);
  assert.deepEqual(applyAudienceShortcut('Clear'), []);
});


test('legacy campaign filters hydrate one selected branch', async () => {
  const { hydrateAudienceSelection } = await import(
    '../src/features/email-sender/audienceSelection.ts'
  );
  assert.deepEqual(hydrateAudienceSelection({
    region: 'USA',
    is_bounced: true,
  }), [{ region: 'USA', is_bounced: true }]);
});
```

Add tests for arbitrary checkbox toggles, deterministic ordering, duplicate removal, and summary labels for one, same-region pair, all four, and arbitrary subsets.

- [ ] **Step 2: Run frontend helper tests and verify RED**

Run: `node --test tests/audienceSelection.test.ts` from `frontend`.

Expected: module import is unavailable and assertions fail.

- [ ] **Step 3: Add audience types and pure helpers**

```typescript
export type AirtableRegion = 'USA' | 'EUR';
export type AudienceSegment = 'standard' | 'dnr';

export interface AirtableAudience {
  region: AirtableRegion;
  is_bounced: boolean;
}

export interface AudiencePreviewBranch extends AirtableAudience {
  count: number;
}

export interface AudiencePreview {
  branches: AudiencePreviewBranch[];
  total_unique: number;
}

export type AudienceShortcut = 'All' | 'USA' | 'EUR' | 'Valid' | 'Bounced' | 'Clear';
```

`applyAudienceShortcut` returns exact replacement sets. `toggleAudience` adds/removes one branch. `normalizeAudienceSelection` sorts USA before EUR and Valid before Bounced. Extend `CampaignFormData`, `EmailCampaign`, and `CampaignDetails` with `audiences?: AirtableAudience[]` and `segment?: AudienceSegment` while retaining legacy fields.

- [ ] **Step 4: Run helper tests and verify GREEN**

Run: `node --test tests/audienceSelection.test.ts` from `frontend`.

Expected: all tests pass.

- [ ] **Step 5: Commit frontend audience primitives**

```powershell
git add frontend/src/features/email-sender/types.ts frontend/src/features/email-sender/audienceSelection.ts frontend/tests/audienceSelection.test.ts
git commit -m "feat: add frontend audience selection model"
```

---

### Task 7: Wizard State, Validation, and Payload Construction

**Files:**
- Create: `frontend/src/features/email-sender/campaignWizardState.ts`
- Create: `frontend/tests/campaignWizardState.test.ts`

**Interfaces:**
- Consumes: audience primitives and `CampaignFormData` from Task 6.
- Produces: `CampaignWizardDraft`, `validateWizardStep`, `invalidateAudiencePreview`, `buildCampaignPayload`, and `hydrateCampaignWizardDraft`.

- [ ] **Step 1: Write failing wizard-state tests**

```typescript
test('audience step requires branches and a fresh preview', async () => {
  const { validateWizardStep } = await import(
    '../src/features/email-sender/campaignWizardState.ts'
  );
  assert.equal(validateWizardStep(0, {
    sourceType: 'airtable',
    audiences: [],
    segment: 'standard',
    audiencePreview: null,
    audiencePreviewStale: true,
  }), 'Select at least one Airtable audience.');
});


test('payload keeps all selected branches and one segment', async () => {
  const { buildCampaignPayload } = await import(
    '../src/features/email-sender/campaignWizardState.ts'
  );
  const payload = buildCampaignPayload({
    sourceType: 'airtable',
    audiences: [
      { region: 'USA', is_bounced: false },
      { region: 'EUR', is_bounced: true },
    ],
    segment: 'dnr',
    audiencePreview: {
      branches: [
        { region: 'USA', is_bounced: false, count: 17 },
        { region: 'EUR', is_bounced: true, count: 49 },
      ],
      total_unique: 66,
    },
    audiencePreviewStale: false,
    senderMode: 'all',
    selectedGroup: '',
    selectedAccounts: [],
    campaignName: 'Combined audience',
    subject: 'A subject',
    htmlBody: '<p>Hello</p>',
    scheduledAt: null,
    csvFile: null,
  });
  assert.deepEqual(payload.audiences, [
    { region: 'USA', is_bounced: false },
    { region: 'EUR', is_bounced: true },
  ]);
  assert.equal(payload.segment, 'dnr');
  assert.equal('region' in payload, false);
});
```

Add tests for sender mode validation, campaign name/subject/body, zero-recipient scheduling rejection, Draft allowed at zero, preview invalidation after audience/segment changes, and legacy hydration.

- [ ] **Step 2: Run wizard-state tests and verify RED**

Run: `node --test tests/campaignWizardState.test.ts` from `frontend`.

Expected: module import is unavailable and assertions fail.

- [ ] **Step 3: Implement pure wizard state**

```typescript
export type CampaignWizardStep = 0 | 1 | 2;

export interface CampaignWizardDraft {
  sourceType: CampaignSource;
  audiences: AirtableAudience[];
  segment: AudienceSegment;
  audiencePreview: AudiencePreview | null;
  audiencePreviewStale: boolean;
  senderMode: 'all' | 'group' | 'manual';
  selectedGroup: string;
  selectedAccounts: SelectedAccount[];
  campaignName: string;
  subject: string;
  htmlBody: string;
  scheduledAt: string | null;
  csvFile: File | null;
}
```

`validateWizardStep(0, draft)` validates source-specific fields and preview. Step 1 validates sender selection, name, subject, and zero-recipient scheduling. Step 2 validates HTML body. `buildCampaignPayload` emits `audiences/segment` only for Airtable and CSV file only for new CSV campaigns.

- [ ] **Step 4: Run wizard-state tests and verify GREEN**

Run: `node --test tests/campaignWizardState.test.ts` from `frontend`.

Expected: all tests pass.

- [ ] **Step 5: Commit wizard state logic**

```powershell
git add frontend/src/features/email-sender/campaignWizardState.ts frontend/tests/campaignWizardState.test.ts
git commit -m "feat: add campaign wizard state validation"
```

---

### Task 8: Three-Step Campaign Wizard UI

**Files:**
- Create: `frontend/src/features/email-sender/CampaignWizard.tsx`
- Create: `frontend/src/features/email-sender/AudienceStep.tsx`
- Create: `frontend/src/features/email-sender/CampaignSetupStep.tsx`
- Create: `frontend/src/features/email-sender/ContentReviewStep.tsx`
- Modify: `frontend/src/pages/EmailSenderPage.tsx:1-1126,1467-1478`

**Interfaces:**
- Consumes: Task 3 preview endpoint, Task 6 helpers, and Task 7 state functions.
- Produces: `CampaignWizard` with the same save callback contract currently consumed by `EmailSenderPage`.

- [ ] **Step 1: Add the wizard shell with fixed navigation**

```typescript
export interface CampaignWizardProps {
  open: boolean;
  initialCampaignId?: string | null;
  onClose: () => void;
  onSave: (campaign: CampaignFormData, mapping?: CsvColumnMapping) => Promise<void> | void;
}
```

`CampaignWizard` owns the MUI `Dialog`, uses `maxWidth="lg"`, a Stepper in `DialogTitle`, scrollable `DialogContent`, and a fixed `DialogActions`. Footer actions are Cancel, Back, and Continue; the last step shows Save draft or Schedule campaign. All async buttons expose loading and disabled states.

- [ ] **Step 2: Implement `AudienceStep` from pure selection helpers**

Render source as a two-option segmented control. For Airtable, render a semantic checkbox matrix with column headers Valid/Bounced and row headers USA/EUR. Shortcut buttons call `applyAudienceShortcut` and replace the set exactly. Segment uses a two-option exclusive control. On Continue, call:

```typescript
const response = await apiClient.post<AudiencePreview>(
  '/sender/audience-preview',
  { audiences: draft.audiences, segment: draft.segment },
  { timeout: 15_000 },
);
```

Store the response, render branch counts and total unique, and retain all selection state on error. Keep the existing CSV upload, preview, mapping, drag/drop, and warning behavior inside the CSV branch.

- [ ] **Step 3: Implement `CampaignSetupStep`**

Move sender loading and selection, campaign name, subject, and schedule controls out of `EmailSenderPage`. Use one field group per concern without nested elevated cards. Preserve all/group/manual modes and current account/group APIs. Show the zero-audience warning inline and prevent scheduling while `total_unique === 0`.

```typescript
export interface CampaignSetupStepProps {
  draft: CampaignWizardDraft;
  senderOptions: SenderOptions;
  loadingSenders: boolean;
  onDraftChange: (patch: Partial<CampaignWizardDraft>) => void;
}
```

The component emits patches only; `CampaignWizard` remains the single owner of state. The schedule picker receives `disabled={draft.audiencePreview?.total_unique === 0}` for Airtable campaigns and displays `No eligible recipients; save as Draft or change the audience.` as helper text.

- [ ] **Step 4: Implement `ContentReviewStep`**

Move template loading/saving, HTML editor, Edit/Preview toggle, EmailPreview, and send-test dialog. Add a compact summary panel that lists audience summary, segment, sender mode, and schedule. Keep Send test disabled until subject and body are non-empty.

```typescript
export interface ContentReviewStepProps {
  draft: CampaignWizardDraft;
  templates: EmailTemplate[];
  viewMode: 'code' | 'preview';
  sendingTest: boolean;
  onDraftChange: (patch: Partial<CampaignWizardDraft>) => void;
  onViewModeChange: (mode: 'code' | 'preview') => void;
  onLoadTemplate: (templateId: string) => void;
  onSaveTemplate: (name: string) => Promise<void>;
  onSendTest: (emails: string[]) => Promise<void>;
}
```

Render the review values from `summarizeAudienceSelection(draft.audiences)`, the segment label, sender mode, and scheduled timestamp. Do not duplicate these derivations inside JSX.

- [ ] **Step 5: Replace the inline form in `EmailSenderPage`**

Delete the local `CampaignForm` component and now-unused MUI/icon imports. Replace the old Dialog block with:

```tsx
<CampaignWizard
  open={isModalOpen}
  initialCampaignId={editingCampaignId}
  onClose={() => {
    setIsModalOpen(false);
    setEditingCampaignId(null);
    setError(null);
  }}
  onSave={handleSaveCampaign}
/>
```

Keep `handleSaveCampaign`, campaign pagination, launch, edit, and delete behavior in the page.

- [ ] **Step 6: Run focused frontend verification**

Run from `frontend`:

```powershell
node --test tests/audienceSelection.test.ts tests/campaignWizardState.test.ts
npm exec eslint -- src/features/email-sender/CampaignWizard.tsx src/features/email-sender/AudienceStep.tsx src/features/email-sender/CampaignSetupStep.tsx src/features/email-sender/ContentReviewStep.tsx src/pages/EmailSenderPage.tsx
npm run build
```

Expected: helper tests pass, ESLint exits 0, and Vite production build exits 0.

- [ ] **Step 7: Commit the wizard UI**

```powershell
git add frontend/src/features/email-sender/CampaignWizard.tsx frontend/src/features/email-sender/AudienceStep.tsx frontend/src/features/email-sender/CampaignSetupStep.tsx frontend/src/features/email-sender/ContentReviewStep.tsx frontend/src/pages/EmailSenderPage.tsx
git commit -m "feat: replace campaign form with guided wizard"
```

---

### Task 9: Multi-Audience Table Presentation

**Files:**
- Create: `frontend/src/features/email-sender/audiencePresentation.ts`
- Create: `frontend/tests/audiencePresentation.test.ts`
- Modify: `frontend/src/features/email-sender/CampaignTableWorkspace.tsx:240-262`

**Interfaces:**
- Consumes: `EmailCampaign.audiences`, legacy fields, and segment.
- Produces: `buildAudiencePresentation(campaign) -> { label: string; detail: string; tooltip: string }`.

- [ ] **Step 1: Write failing literal presentation tests**

```typescript
test('summarizes all four Airtable branches', async () => {
  const { buildAudiencePresentation } = await import(
    '../src/features/email-sender/audiencePresentation.ts'
  );
  const result = buildAudiencePresentation({
    id: 'Campaign_all',
    createdAt: '2026-08-24T12:00:00Z',
    source_type: 'airtable',
    status: 'Draft',
    audiences: [
      { region: 'USA', is_bounced: false },
      { region: 'USA', is_bounced: true },
      { region: 'EUR', is_bounced: false },
      { region: 'EUR', is_bounced: true },
    ],
    segment: 'standard',
  });
  assert.equal(result.label, 'All Airtable audiences');
  assert.equal(result.detail, 'Not Donors');
});
```

Add tests for one branch, both branches in EUR, arbitrary `first +N`, tooltip details, CSV, and legacy campaigns.

- [ ] **Step 2: Run presentation tests and verify RED**

Run: `node --test tests/audiencePresentation.test.ts` from `frontend`.

Expected: module import is unavailable and assertions fail.

- [ ] **Step 3: Implement and consume the presentation helper**

Use `hydrateAudienceSelection` so old and new campaigns share one display path. Replace the table's direct region/bounced rendering with label, detail, and a Tooltip for multi-branch selections. Preserve the source chip and fixed column layout.

```typescript
export interface AudiencePresentation {
  label: string;
  detail: string;
  tooltip: string;
}

export function buildAudiencePresentation(campaign: EmailCampaign): AudiencePresentation {
  if (campaign.source_type === 'csv') {
    return {
      label: campaign.csv_filename || 'CSV audience',
      detail: campaign.status === 'Draft' ? 'Upload pending' : 'File processed',
      tooltip: campaign.csv_filename || 'CSV audience',
    };
  }
  const audiences = hydrateAudienceSelection(campaign);
  return {
    label: summarizeAudienceSelection(audiences),
    detail: campaign.segment === 'dnr' ? 'Donors' : 'Not Donors',
    tooltip: audiences
      .map((audience) => `${audience.region} · ${audience.is_bounced ? 'Bounced' : 'Valid'}`)
      .join(', '),
  };
}
```

- [ ] **Step 4: Run presentation tests, lint, and build**

Run from `frontend`:

```powershell
node --test tests/audiencePresentation.test.ts tests/campaignPresentation.test.ts tests/campaignTableLayout.test.ts
npm exec eslint -- src/features/email-sender/audiencePresentation.ts src/features/email-sender/CampaignTableWorkspace.tsx
npm run build
```

Expected: all tests pass, ESLint exits 0, and build exits 0.

- [ ] **Step 5: Commit table presentation**

```powershell
git add frontend/src/features/email-sender/audiencePresentation.ts frontend/src/features/email-sender/CampaignTableWorkspace.tsx frontend/tests/audiencePresentation.test.ts
git commit -m "feat: summarize multi-audience campaigns"
```

---

### Task 10: Full Regression and Visual Verification

**Files:**
- Verify only; fix only files implicated by a failing test.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: evidence that backend, frontend, CSV, legacy campaigns, and local runtime remain healthy.

- [ ] **Step 1: Run the complete email-sender backend regression suite**

```powershell
backend\venv\Scripts\python.exe -m pytest backend/tests/test_campaign_audiences.py backend/tests/test_airtable_campaign_audiences.py backend/tests/test_email_sender_campaign_writes.py backend/tests/test_email_sender_campaign_storage.py backend/tests/test_email_sender_execution_safety.py backend/tests/test_email_sender_csv_preview.py backend/tests/test_email_sender_test_delivery.py backend/tests/test_email_sender_service_audiences.py -q
```

Expected: zero failures.

- [ ] **Step 2: Run all focused frontend tests**

From `frontend`:

```powershell
node --test tests/audienceSelection.test.ts tests/campaignWizardState.test.ts tests/audiencePresentation.test.ts tests/campaignPresentation.test.ts tests/campaignTableLayout.test.ts
```

Expected: zero failures.

- [ ] **Step 3: Run lint and production build**

From `frontend`:

```powershell
npm exec eslint -- src/features/email-sender src/pages/EmailSenderPage.tsx
npm run build
```

Expected: ESLint and build exit 0. The existing EmailStudio large-chunk warning is acceptable; no new warning is introduced by the wizard.

- [ ] **Step 4: Verify live API contracts**

With frontend and backend running, authenticate in the existing local session and verify:

- preview of EUR Valid + EUR Bounced returns two branch rows and one unique total;
- arbitrary USA Valid + EUR Bounced remains selected after Back/Continue;
- all four branches save and appear as `All Airtable audiences` in the table;
- zero-recipient Airtable selection saves Draft but cannot schedule or launch;
- one legacy campaign opens with its original single branch selected;
- CSV creation, mapping, save, and edit still work.

- [ ] **Step 5: Verify responsive and accessibility behavior**

Check the modal at approximately 1280 px, 768 px, and 320 px widths plus 200% zoom. Confirm no horizontal page overflow, fixed navigation remains reachable, checkbox labels have accessible names, keyboard focus follows step changes, errors focus the relevant field, and loading disables duplicate actions.

- [ ] **Step 6: Run diff hygiene and commit final verification fixes**

```powershell
git diff --check
git status --short
```

If verification required code changes, stage only those files and commit:

```powershell
git commit -m "fix: complete campaign wizard verification"
```

If no files changed, do not create an empty commit.
