/**
 * Privacy page copy (v2 §J/§K). Written to describe only what the app actually does -- checked
 * against the real implementation, not the original plan, since a couple of planned pieces
 * (email verification, a Turnstile anti-bot check) were never built (docs/DECISIONS.md D-054).
 */
export const privacy = {
  title: "Privacy",
  metaDescription: "What BLDokja stores, where, and who can see it: local-first by default, with an optional account for cross-device sync. No analytics, no third-party trackers.",
  updated: "Last reviewed: 18 September 2026.",
  intro: "This is a small, local-first project with no company behind it and nothing to sell. This page describes exactly what is stored and where, so you don't have to take that on faith.",
  sections: {
    local: {
      title: "Without an account",
      body: [
        "Everything you do -- lessons completed, drill attempts, letter-pair images, settings -- is stored in this browser, using IndexedDB. It never leaves your device.",
        "Nothing is sent to any server. There is no way for anyone, including whoever runs this site, to see your practice history.",
        "You can export everything as a single JSON file, or delete it all, from Settings, at any time.",
        "Clearing your browser's site data, or using a different browser or device, starts you over with nothing saved -- there is no backup unless you create an account.",
      ],
    },
    account: {
      title: "With an account",
      body: [
        "An account is optional and exists only to sync your data across devices. Creating one needs a username and password -- never an email address, because this site has no way to send one.",
        "Behind the scenes, the login system used (Supabase Auth) expects an email-shaped address, so one is generated from your username automatically. It is never real, never used to send anything, and never shown to you.",
        "Signing in syncs your practice history, letter-pair images, and settings to a private, access-controlled database (Supabase/Postgres) so your other devices can pull them down. Only your account can read your own data -- this is enforced by the database itself (row-level security), not just by the app's code.",
        "Password recovery uses a one-time recovery code shown once at sign-up. If it's lost, recovery is manual: contact the address below.",
        "Deleting your account permanently removes your account and everything synced to it, everywhere. It doesn't touch what's saved locally in whichever browser you're using -- clear that separately from Settings if you want it gone too.",
      ],
    },
    leaderboards: {
      title: "Leaderboards",
      body: [
        "Leaderboards are opt-in and off by default. Opting in shows a public display name -- never your login username; it starts as an anonymous name and you can change it -- next to a ranking added up on the server from the practice records your account syncs. Those records come from your own browser and aren't independently verified.",
        "Opting out, or deleting your account, removes you from every leaderboard immediately, including past months in the archive.",
      ],
    },
    thirdParties: {
      title: "Third parties",
      body: [
        "No analytics and no advertising or tracking scripts of any kind run on this site.",
        "Account data (Supabase) and hosting (Cloudflare Pages) are the only outside services involved, and only insofar as an account is used or the site is loaded at all. Cloudflare, like any web host, may log basic technical access data (such as IP addresses) as a normal part of serving the site -- this is standard for essentially every website and outside this project's control.",
      ],
    },
    contact: {
      title: "Questions",
      body: ["If anything here is unclear, or you want help with account deletion or recovery:"],
      linkLabel: "Contact",
    },
  },
} as const;
