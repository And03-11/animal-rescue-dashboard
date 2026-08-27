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


def test_send_email_submits_plain_text_then_html_alternatives():
    api = _FakeGmailApi(result={"id": "gmail-message-1"})
    service = _gmail_service(api)
    unsubscribe_url = "https://tracking.animallove.cr/unsubscribe?t=unique-token"
    html_body = f"""
    <html><body>
      <h1>Animal &amp; Love</h1>
      <p>Support a rescue <a href="https://donations.animallove.cr/give">today</a>.</p>
      <p><a href="{unsubscribe_url}">Unsubscribe</a></p>
      <script>window.shouldNotAppear = true;</script>
      <style>.should-not-appear {{ color: red; }}</style>
    </body></html>
    """

    result = service.send_email(
        to_email="donor@example.org",
        subject="Thank you",
        html_body=html_body,
    )

    assert result.success is True
    raw = api.messages_resource.sent[0]["body"]["raw"]
    parsed = message_from_bytes(base64.urlsafe_b64decode(raw.encode("ascii")))
    alternatives = parsed.get_payload()

    assert parsed.get_content_type() == "multipart/alternative"
    assert [part.get_content_type() for part in alternatives] == [
        "text/plain",
        "text/html",
    ]
    assert [part.get_content_charset() for part in alternatives] == ["utf-8", "utf-8"]

    plain_text = alternatives[0].get_payload(decode=True).decode("utf-8")
    html_text = alternatives[1].get_payload(decode=True).decode("utf-8")
    assert "Animal & Love" in plain_text
    assert "Support a rescue today." in plain_text
    assert "https://donations.animallove.cr/give" in plain_text
    assert unsubscribe_url in plain_text
    assert "shouldNotAppear" not in plain_text
    assert "should-not-appear" not in plain_text
    assert unsubscribe_url in html_text
    assert html_text == html_body


def test_send_email_plain_text_keeps_adjacent_table_cells_separate():
    api = _FakeGmailApi(result={"id": "gmail-message-1"})
    service = _gmail_service(api)
    html_body = (
        "<table><tr><th>Amount</th><th>Status</th></tr>"
        "<tr><td>Donate</td><td>Now</td></tr></table>"
    )

    result = service.send_email(
        to_email="donor@example.org",
        subject="Table update",
        html_body=html_body,
    )

    assert result.success is True
    raw = api.messages_resource.sent[0]["body"]["raw"]
    parsed = message_from_bytes(base64.urlsafe_b64decode(raw.encode("ascii")))
    plain_text = parsed.get_payload()[0].get_payload(decode=True).decode("utf-8")

    assert "Amount Status" in plain_text
    assert "Donate Now" in plain_text
