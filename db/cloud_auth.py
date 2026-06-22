"""OAuth user-credential helpers for the cloud mirror.

The one place google's auth libs are imported -- config stays import-light and
the uploader leans on this. Auth is an OAuth *user* token ("the person storing
the data"), not a service account:

  * login()        -- a one-time interactive browser consent that writes a token
                      json (access + long-lived refresh token). Run via
                      `run.sh --cloud-login`.
  * drive_service() -- headless thereafter: load that token, silently refresh the
                      access token when it expires (persisting the refreshed one),
                      and return a built Drive v3 client.

So the operator only does the browser step once per laptop; every later session
runs unattended off the refresh token.
"""

from __future__ import annotations

from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload


def login(client_secret_path: str, token_path: str, scopes: list[str]) -> str:
    """Interactive one-time consent -- writes the user token to `token_path`.

    `client_secret_path` is the OAuth client (Desktop app) json from the Google
    Cloud project. Opens a browser, runs a throwaway local server to catch the
    redirect, and persists the resulting credentials (incl. the refresh token).
    """
    flow = InstalledAppFlow.from_client_secrets_file(client_secret_path, scopes)
    creds = flow.run_local_server(port=0)
    _persist(creds, token_path)
    return token_path


def drive_service(token_path: str, scopes: list[str]):
    """Build an authenticated Drive v3 client from a saved user token.

    Fails fast with a clear message if the token is missing or unusable, so the
    operator sees the problem at startup rather than a silent no-op. A merely
    expired token is refreshed in place (and the fresh one written back).
    """
    if not Path(token_path).exists():
        raise FileNotFoundError(
            f"no Drive token at {token_path}; run `./run.sh --cloud-login "
            f"--gdrive-client-secret <client_secret.json>` first"
        )
    creds = Credentials.from_authorized_user_file(token_path, scopes)
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            _persist(creds, token_path)
        else:
            raise RuntimeError(
                f"Drive token at {token_path} is invalid and not refreshable; "
                f"re-run `./run.sh --cloud-login`"
            )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


# Parquet has no registered mimetype; pass one explicitly so MediaFileUpload
# doesn't trip on an unguessable extension (behaviour varies across versions).
_MIME = "application/octet-stream"


def create_file(service, path, name: str, folder_id: str) -> str:
    """Upload a new file into the Drive folder, returning its Drive file id."""
    media = MediaFileUpload(str(path), mimetype=_MIME, resumable=False)
    body = {"name": name, "parents": [folder_id]}
    created = service.files().create(body=body, media_body=media, fields="id").execute()
    return created["id"]


def update_file(service, path, drive_id: str) -> None:
    """Replace the contents of an existing Drive file (e.g. dives.parquet)."""
    media = MediaFileUpload(str(path), mimetype=_MIME, resumable=False)
    service.files().update(fileId=drive_id, media_body=media).execute()


def _persist(creds, token_path: str) -> None:
    Path(token_path).write_text(creds.to_json())
