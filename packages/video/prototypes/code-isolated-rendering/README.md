# Code-isolated rendering prototype

Throwaway source for ticket 03. It tests the thin-client candidate only: production runs in
the repository-owning host process, while a Docker container receives just the readable
client, public catalog, current plan and current timed-beat artifact. The container has no
repository mount.

This is evidence about the boundary, not production packaging or a public command design.
The exact commands and verdict are recorded in the ticket on the production branch.
