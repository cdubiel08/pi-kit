# Security

## Data behavior

The bundled extension runs locally inside Pi with the user's permissions. It:

- reads its optional global JSON configuration;
- reads Pi's in-memory model, usage, and tool-result metadata for rendering;
- runs read-only `git rev-parse` and `git status --porcelain` commands in the current working directory;
- optionally uses Pi's built-in tool definitions when installing custom renderers; this is off by default and skips tools already overridden by another source.

It does not include credentials, telemetry, analytics, network clients, remote services, or automatic uploads.

The welcome panel may display recent local project directory names in the terminal, but not their full paths. Set `"welcomeOverlay": "never"` to disable it. `hardwareBarCursor` is off by default; enabling it writes DECSET/DECSCUSR cursor-control sequences to the active terminal and restores the terminal default on shutdown.

## Reporting

Please report vulnerabilities privately through GitHub's security advisory flow rather than a public issue.
