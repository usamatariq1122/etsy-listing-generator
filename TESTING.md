# Manual test checklist

Run this against a fresh deploy preview (or `netlify dev` at
`http://localhost:5173`, never `:8888`). Do a full pass for each area before
moving on. Note the result of every step; a step that does not match its
expected result is a bug to report, not to work around.

You will need two email addresses you can actually read from, so the
isolation and reset flows can be verified end to end.

## Sign up

1. Open the portal. Expected: the sign-in card shows, with the Terms and
   Privacy links and the contact email (when configured) under it, and the
   Etsy trademark notice in the footer.
2. Switch to **Create account**, enter a name, email and password, submit.
   Expected: the account is created and you are asked to verify your email;
   no listing data is shown yet.
3. Sign up with a password you have used before on another account.
   Expected: still accepted (passwords are not shared across accounts), and
   each account stays separate.

## Email verification

4. Open the verification email and click the link. Expected: the address is
   marked verified once and the link is single-use — reopening it a second
   time says it no longer works.
5. Request a new verification link and let it sit past its expiry. Expected:
   the expired link is refused.
   - If the deployment has no mail sender configured, note that no email is
     delivered and stop this section here; the account still works.

## Sign in and sign out

6. Sign in with the verified address and correct password. Expected: the
   studio opens and the sidebar shows this account's History only.
7. Sign in with a wrong password five times. Expected: after the fifth
   failure a short wait is imposed before the next attempt is checked.
8. Sign out. Expected: you are back at the sign-in card, and the browser
   session cookie is gone.

## Forgot and reset password

9. Use **Forgot password** with the account email. Expected: a reset request
   is accepted whether or not the address exists (no account enumeration).
10. Open the reset email and use the link. Expected: a single-use, hashed,
    expiring token that lets you set a new password, then signs you in with
    it.
11. Reuse the same reset link. Expected: refused — the token is spent.

## Second-account isolation

12. Sign in as account A and generate one package so History has an entry.
13. Sign out, sign in as account B (or register it). Expected: B's History is
    empty and none of A's products, images, keys or settings are visible.
14. In B, try to open one of A's products by its direct link/id. Expected:
    refused — ownership is by the encoded `<userId>:<productId>` and B cannot
    reach A's rows.

## Generation

15. With a provider key saved in Settings, run a generation from the
    wizard. Expected: File 1 and File 2 are produced, the SEO score and 13
    tags render, and the ZIP downloads with the seven image slots.
16. Confirm the configured brand is the only shop name that appears in the
    PDFs/prompts/licence line. Expected: no other brand name shows anywhere.
17. Expected: the word "Etsy" never appears inside any generated image or
    file.

## Prompt templates (admin)

18. As the owner, open Settings → prompt templates. Expected: templates are
    global and only the owner can edit them.
19. Edit the template for a product type and generate that type. Expected:
    the change is used; a type with no saved template falls back to the
    built-in master prompt.

## Etsy connect

> Only when `ETSY_ENABLED=true` and the keystring + shared secret are set on
> the deployment; otherwise every Etsy route returns "not available" and no
> Etsy UI is shown.

20. Click **Connect shop**. Expected: you are taken to Etsy's authorisation
    page asking only for the listings-write permission.
21. Approve. Expected: you return to the portal on a "connected" state; the
    shop name shows; no token is ever shown in the UI or console.
22. **Disconnect**. Expected: the connection is forgotten; anything already
    on Etsy is untouched.

## Draft, then publish

23. On a finished package, fill the four listing answers and click **Create
    Etsy Draft**. Expected: a draft is created on Etsy (not published); the
    panel shows "Draft on Etsy" with a link, and the copy says it was saved as
    a draft.
24. Click **Publish on Etsy** and cancel the confirm. Expected: nothing
    changes; it stays a draft.
25. Click **Publish on Etsy** and confirm. Expected: the draft is made live
    on Etsy; the panel shows "Live on Etsy".
26. Expected at all times: there is no delete action, and the app never asks
    Etsy for the delete permission.

## Double-click guard on Save as draft

27. Click **Create Etsy Draft** and immediately click it again. Expected: the
    button disables on the first click and reads "Saving…", and only one
    draft is created on Etsy.
28. Expected: re-opening a package that is already a draft says so rather
    than creating a second one.

## Cleanup

29. Delete a single listing. Expected: its stored rows and files go together,
    with no hidden copy.
30. **Clear History**. Expected: all of this account's products and files are
    removed.

## Reporting leftovers (do not delete without a decision)

31. Orphaned products with no owner (`user_id IS NULL`) and any rows stuck in
    `status = 'queued'` should be listed by id and confirmed before removal.
    These are not reachable from the UI (they belong to no account), so they
    are read directly from the database. In the local setup the database is
    the PGlite store held by the running `netlify dev`; to inspect it safely,
    stop `netlify dev` first, then run:

    ```bash
    netlify database connect --query \
      "SELECT id, product_name, status, user_id, created_at
         FROM products
        WHERE user_id IS NULL OR status = 'queued'
        ORDER BY created_at"
    ```

    Never attach to the live `.netlify/db` while `netlify dev` holds it.
