# Waydean — read-only production baseline

**Date:** 2026-10-10  
**Scope:** unauthenticated page and response-header inspection only. No login, tree JSON body, photo body, or write operation was requested or performed.

## Confirmed from the deployed page

- The public tree page responded with HTTP 200 and title `Хьоти некъ`.
- Delivered page markup contains navigation/actions for the khotu and full-tree views, “Кто я?” and clearing that selection, logout, link editing, history, backups, administration, appearance, and day/night selection.
- The appearance selector contains “Классика” and “Премиум”. This is a visual theme selector in the delivered markup; it does not establish a paid entitlement or launch the new Waydean UI.
- Markup presence does not confirm that each action works, is enabled for every role, or still matches the checked-out source. Those behaviors remain open.

## Data endpoint observation

An unauthenticated `HEAD` request to the tree JSON endpoint configured by the page returned HTTP 200 with `application/json`. The response body was not requested or read. This confirms that the endpoint answers a request without a browser login, but it does not establish complete GET, CDN, or authorization behavior. Confirm the intended public/private access policy before the new UI relies on this endpoint.

No photo URL was queried. No production API action, login, session, publish, backup, restore, or account change was performed.

## Release impact

- Do not use the current “Премиум” appearance selector as an access check or silently repurpose it.
- The new interface still has no confirmed personal-account identifier or server-verified entitlement in the current adapter contract.
- Staging remains unverified. Use a synthetic clone and an isolated entitlement for the owner account before connecting the production entry point.
- The production UI remains the fallback; no production source or data was changed during this check.
