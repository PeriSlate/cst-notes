# CST Notes 0.1.5

CST Notes 0.1.5 fixes first-run setup for new users with empty vaults. Initialization now creates the empty mobile-safe surgeon registry before graph generation, so setup completes without requiring pre-existing surgeons or cases and does not reopen during later navigation.

If setup previously failed, update and run **Initialize / repair installation** once. Existing case and surgeon data is preserved.
