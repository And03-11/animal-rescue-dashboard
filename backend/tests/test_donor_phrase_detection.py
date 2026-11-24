import asyncio
import json
from unittest.mock import AsyncMock

import httpx
import pytest

from backend.app.services import donor_phrase_detection as detection


@pytest.fixture(autouse=True)
def no_live_ai(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)


def detect(html):
    return asyncio.run(detection.detect_donor_phrase(html))


@pytest.mark.parametrize("original,singular,plural", [
    ("donation three days ago", "donation {{when}}", "{{count}} donations in the past week"),
    ("donation 21 days ago", "donation {{when}}", "{{count}} donations in the past week"),
    ("donation twenty-one days ago", "donation {{when}}", "{{count}} donations in the past week"),
    ("donation yesterday", "donation {{when}}", "{{count}} donations in the past week"),
    ("recent donation", "donation {{when}}", "{{count}} donations in the past week"),
    ("donation you made nine days ago", "donation you made {{when}}", "{{count}} donations you’ve made over the past week"),
    ("gift you gave earlier today", "gift you gave {{when}}", "{{count}} gifts you’ve given over the past week"),
    ("contribution you sent last week", "contribution you sent {{when}}", "{{count}} contributions you’ve sent over the past week"),
    ("2 donations in the past week", "donation {{when}}", "{{count}} donations in the past week"),
    ("three gifts you have made in the last week", "gift you made {{when}}", "{{count}} gifts you have made in the last week"),
    ("twenty one donations in the past week", "donation {{when}}", "{{count}} donations in the past week"),
])
def test_rules_replace_only_the_source_text(original, singular, plural, monkeypatch):
    ai = AsyncMock(side_effect=AssertionError("Known phrases must not call AI"))
    monkeypatch.setattr(detection, "ai_proposal", ai)
    html = ('<!doctype html>\r\n<table style="width:600px"><tr><td><strong>Hi {{name}},</strong>'
        f'<p style="color:#123">A big thank you for your {original}, and for your kindness 💛</p>'
        '<a href="https://example.org/give?x=1&amp;y=2"><img src="https://example.org/a.gif"></a></td></tr></table>')
    result = detect(html)
    assert result.status == "matched"
    assert result.source == "rules"
    assert result.content == html.replace(original, "{{Day}}", 1)
    assert result.donor_singular_phrase == singular
    assert result.donor_plural_phrase == plural
    ai.assert_not_called()


def test_entities_keep_their_original_source_outside_the_replacement():
    html = '<p>Thank you &amp; heartfelt gratitude for your donation&nbsp;three&#32;days ago. &copy; 2026</p>'
    result = detect(html)
    assert result.status == "matched"
    assert result.content == '<p>Thank you &amp; heartfelt gratitude for your {{Day}}. &copy; 2026</p>'


@pytest.mark.parametrize("history", [
    '<p>Hi {{name}},</p><p>Thank you for your donation three days ago.</p>',
    '<blockquote><p>Thank you for your donation three days ago.</p></blockquote>',
    '<div class="gmail_quote">Thank you for your donation three days ago.</div>',
    '<div type="cite">Thank you for your donation three days ago.</div>',
])
def test_does_not_personalize_forwarded_history(history):
    html = '<p>Hi {{name}},</p><p>Here is the update we sent earlier.</p>' + history
    result = detect(html)
    assert result.status == "not_found"
    assert result.content == html


def test_current_note_is_changed_but_identical_historical_phrase_is_not():
    current = '<p>Hi {{name}},</p><p>Thank you for your donation three days ago.</p>'
    result = detect(current + current)
    assert result.content == current.replace('donation three days ago', '{{Day}}') + current


def test_hidden_preview_attributes_and_style_are_never_candidates():
    html = ('<html><head><style>.x:after{content:"Thank you for your donation three days ago"}</style></head><body>'
        '<div style="display: none">Thank you for your donation three days ago.</div>'
        '<p title="Thank you for your donation three days ago">Hi {{name}},</p><p>Our next update.</p></body></html>')
    result = detect(html)
    assert result.status == "not_found"
    assert result.content == html


def test_existing_day_keeps_all_html_and_does_not_reset_phrase_settings(monkeypatch):
    ai = AsyncMock()
    monkeypatch.setattr(detection, 'ai_proposal', ai)
    html = '<p>Thank you for your {{Day}}</p>'
    result = detect(html)
    assert result.status == 'already_configured'
    assert result.content == html
    assert result.donor_singular_phrase is None
    assert result.donor_plural_phrase is None
    ai.assert_not_called()


def test_mixed_formatting_requires_manual_placement_instead_of_changing_design():
    html = '<p>Thank you for your <b>donation</b> three days ago.</p>'
    result = detect(html)
    assert result.status == 'needs_review'
    assert result.content == html


def test_multiple_current_phrases_are_not_silently_changed():
    html = '<p>Thank you for your donation three days ago and your gift yesterday.</p>'
    result = detect(html)
    assert result.status == 'needs_review'
    assert result.content == html


@pytest.mark.parametrize('html', [
    '<p>Your donation today will be doubled.</p>',
    '<p>Thank you for reading. Your donation today will be doubled.</p>',
    '<p>Thank you for your donation today, if you can make one.</p>',
])
def test_future_requests_do_not_match_rules(html):
    assert detect(html).status != 'matched'


def ai_ready(monkeypatch, **overrides):
    monkeypatch.setenv('OPENAI_API_KEY', 'fake-test-key')
    monkeypatch.setenv('DONOR_PHRASE_AI_ENABLED', 'true')
    proposal = detection.AIProposal(action='match', original_phrase='gift you shared with us on Tuesday',
        donor_singular_phrase='gift you shared with us {{when}}',
        donor_plural_phrase='{{count}} gifts you’ve shared with us over the past week')
    proposal = proposal.model_copy(update=overrides)
    mock = AsyncMock(return_value=proposal)
    monkeypatch.setattr(detection, 'ai_proposal', mock)
    return mock


def test_ai_recognizes_new_wording_and_only_changes_that_exact_source_fragment(monkeypatch):
    mock = ai_ready(monkeypatch)
    html = '<p>Hi {{name}},</p><b>Thank you for the gift you shared with us on Tuesday.</b>'
    result = detect(html)
    assert result.status == 'matched'
    assert result.source == 'ai'
    assert result.content == '<p>Hi {{name}},</p><b>Thank you for the {{Day}}.</b>'
    assert result.donor_singular_phrase == 'gift you shared with us {{when}}'
    assert '<' not in mock.call_args.args[0]


@pytest.mark.parametrize('noun,detail,date', [
    ('gift', 'you shared with us', 'on Tuesday'),
    ('contribution', 'that you sent so generously', 'earlier this month'),
])
def test_ai_cannot_drop_the_recipient_clause_from_a_dated_phrase(monkeypatch, noun, detail, date):
    original_phrase = f'{noun} {detail} {date}'
    ai_ready(monkeypatch, original_phrase=original_phrase,
        donor_singular_phrase=f'{noun} {{{{when}}}}',
        donor_plural_phrase=f'{{{{count}}}} {noun}s in the past week')
    html = f'<p>Hi {{{{name}}}},</p>\n<p><strong>Thank you for the {original_phrase}.</strong></p>'

    result = detect(html)

    assert result.status == 'matched'
    assert result.content == html.replace(original_phrase, '{{Day}}')
    assert result.donor_singular_phrase == f'{noun} {detail} {{{{when}}}}'
    assert result.donor_plural_phrase == f'{{{{count}}}} {noun}s {detail} in the past week'


@pytest.mark.parametrize('overrides', [
    {'original_phrase': 'made-up phrase'},
    {'original_phrase': 'Thank you for the gift you shared with us on Tuesday'},
    {'donor_plural_phrase': '<b>{{count}} gifts in the past week</b>'},
    {'donor_singular_phrase': 'gift {{Day}}'},
    {'donor_singular_phrase': 'gift on Tuesday'},
    {'donor_singular_phrase': 'recent donation {{when}}'},
    {'donor_singular_phrase': 'gift you gave on {{when}}'},
    {'donor_plural_phrase': 'gifts in the past week'},
    {'donor_plural_phrase': '{{count}} gifts forever'},
    {'original_phrase': 'gift'},
    {'original_phrase': 'gift you shared'},
    {'original_phrase': 'gift you shared with us on Tues'},
])
def test_invalid_ai_output_keeps_the_original_html(monkeypatch, overrides):
    ai_ready(monkeypatch, **overrides)
    html = '<b>Thank you for the gift you shared with us on Tuesday.</b>'
    result = detect(html)
    assert result.status == 'ai_unavailable'
    assert result.content == html
    assert result.donor_singular_phrase is None


@pytest.mark.parametrize('action,status', [('not_found', 'not_found'), ('ambiguous', 'needs_review')])
def test_ai_can_abstain(monkeypatch, action, status):
    ai_ready(monkeypatch, action=action)
    html = '<b>Thank you for the gift you shared with us on Tuesday.</b>'
    assert detect(html).status == status
    assert detect(html).content == html


def test_ai_failure_does_not_return_provider_errors_or_change_html(monkeypatch):
    mock = ai_ready(monkeypatch)
    mock.side_effect = httpx.ConnectError('secret-provider-diagnostic')
    html = '<b>Thank you for the gift you shared with us on Tuesday.</b>'
    result = detect(html)
    assert result.status == 'ai_unavailable'
    assert result.content == html
    assert 'secret' not in result.message


def test_unconfigured_ai_keeps_unknown_wording():
    html = '<b>Thank you for the gift you shared with us on Tuesday.</b>'
    result = detect(html)
    assert result.status == 'ai_unavailable'
    assert result.content == html


def test_provider_request_uses_structured_text_only_without_history(monkeypatch):
    captured = []
    class Client:
        def __init__(self, **_kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *_args): pass
        async def post(self, url, **kwargs):
            captured.append(kwargs['json'])
            proposal = {'action': 'not_found', 'original_phrase': '', 'donor_singular_phrase': '', 'donor_plural_phrase': ''}
            return httpx.Response(200, request=httpx.Request('POST', url), json={'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(proposal)}}]})
    monkeypatch.setattr(detection.httpx, 'AsyncClient', Client)
    monkeypatch.setenv('OPENAI_API_KEY', 'fake-test-key')
    html = ('<p>Hi {{name}},</p><p>Thank you for the gift you shared with us on Tuesday.</p>'
        '<p>Hi {{name}},</p><p>PRIVATE HISTORICAL NOTE</p>')
    assert detect(html).status == 'not_found'
    body = captured[0]
    assert body['response_format']['json_schema']['strict'] is True
    assert body['store'] is False
    assert len(body['messages'][1]['content']) < 1400
    assert '<p>' not in body['messages'][1]['content']
    assert 'PRIVATE HISTORICAL NOTE' not in body['messages'][1]['content']
