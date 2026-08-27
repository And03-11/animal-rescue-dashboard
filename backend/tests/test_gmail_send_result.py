import base64
from email import message_from_bytes

from backend.app.services.gmail_service import GmailService


class _ExecuteRequest:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error

    def execute(self):
        if self.error is not None:
            raise self.error
        return self.result


class _MessagesResource:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.sent = []

    def send(self, *, userId, body):
        self.sent.append({"userId": userId, "body": body})
        return _ExecuteRequest(self.result, self.error)


class _UsersResource:
    def __init__(self, messages):
        self._messages = messages

    def messages(self):
        return self._messages


class _FakeGmailApi:
    def __init__(self, result=None, error=None):
        self.messages_resource = _MessagesResource(result, error)

    def users(self):
        return _UsersResource(self.messages_resource)


def _gmail_service(api):
    service = GmailService.__new__(GmailService)
    service.credentials_path = "sender.json"
    service.service = api
    return service


def test_send_email_returns_message_metadata_and_adds_safe_headers():
    api = _FakeGmailApi(result={"id": "gmail-message-1", "threadId": "thread-1"})
    service = _gmail_service(api)

    result = service.send_email(
        to_email="donor@example.org",
        subject="Thank you",
        html_body='<a href="https://donations.animallove.cr/give">Donate</a>',
        extra_headers={
            "List-Unsubscribe": "<https://donations.animallove.cr/unsubscribe?t=abc>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    )

    assert result.success is True
    assert bool(result) is True
    assert result.message_id == "gmail-message-1"
    assert result.thread_id == "thread-1"
    assert result.error is None

    raw = api.messages_resource.sent[0]["body"]["raw"]
    parsed = message_from_bytes(base64.urlsafe_b64decode(raw.encode("ascii")))
    assert parsed["List-Unsubscribe"] == (
        "<https://donations.animallove.cr/unsubscribe?t=abc>"
    )
    assert parsed["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"


def test_send_email_returns_failure_without_gmail_metadata():
    api = _FakeGmailApi(error=RuntimeError("transport unavailable"))
    service = _gmail_service(api)

    result = service.send_email(
        to_email="donor@example.org",
        subject="Subject",
        html_body="<p>Body</p>",
    )

    assert result.success is False
    assert bool(result) is False
    assert result.message_id is None
    assert result.thread_id is None
    assert result.error == "transport unavailable"


def test_send_email_rejects_header_injection_before_calling_gmail():
    api = _FakeGmailApi(result={"id": "should-not-send"})
    service = _gmail_service(api)

    try:
        service.send_email(
            to_email="donor@example.org",
            subject="Subject",
            html_body="<p>Body</p>",
            extra_headers={"List-Unsubscribe": "safe\r\nBcc: attacker@example.org"},
        )
    except ValueError as error:
        assert str(error) == "Email header values cannot contain newlines"
    else:
        raise AssertionError("Expected unsafe email headers to be rejected")

    assert api.messages_resource.sent == []
