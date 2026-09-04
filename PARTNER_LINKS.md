# Partner secure links

Each partner has a private, unguessable dashboard at
`https://approvedreporting.netlify.app/p/<token>`. No password needed —
the token *is* the credential, so treat these URLs like secrets and only
share each one with its own partner.

The live mapping is the `PARTNER_TOKENS` env var in Netlify
(`{ "<token>": "<partner-slug>" }`). This file is just a human-readable
record — **Netlify is the source of truth**. If you rotate or add a
token, update Netlify *and* this file.

To add a partner: generate a token with `openssl rand -hex 8`, map it to
the partner's slug (lowercased name, spaces → hyphens) in `PARTNER_TOKENS`,
redeploy, then add a row here.

| Partner | Slug | Link |
|---|---|---|
| SKY | `sky` | https://approvedreporting.netlify.app/p/120ee92aee11ab71 |
| Workforce | `workforce` | https://approvedreporting.netlify.app/p/897828b7ed7184da |
| Bizimply | `bizimply` | https://approvedreporting.netlify.app/p/d6d87f25ef0692b7 |
| Square | `square` | https://approvedreporting.netlify.app/p/f074b577c4b8e13f |
| Lightspeed | `lightspeed` | https://approvedreporting.netlify.app/p/0d4309316d6c25e4 |
| WRS | `wrs` | https://approvedreporting.netlify.app/p/e597414a81b05a57 |
| Sona | `sona` | https://approvedreporting.netlify.app/p/0c2d2e245c13d685 |
| Deputy | `deputy` | https://approvedreporting.netlify.app/p/6871a8b66627e9a1 |
| Nory | `nory` | https://approvedreporting.netlify.app/p/85ea2ea260cae75c |
| Stampede | `stampede` | https://approvedreporting.netlify.app/p/246bb2246599ed06 |
| Fourth | `fourth` | https://approvedreporting.netlify.app/p/3c973ae0de7ce497 |
| Tenzo | `tenzo` | https://approvedreporting.netlify.app/p/4a89921bb5dcb5eb |
| Como | `como` | https://approvedreporting.netlify.app/p/f8645d8499a62582 |
| Storekit | `storekit` | https://approvedreporting.netlify.app/p/8dacee449792aa77 |
| Tayl | `tayl` | https://approvedreporting.netlify.app/p/3759ea1576c8bfe3 |
| Apicbase | `apicbase` | https://approvedreporting.netlify.app/p/cb1da4163286213f |
| Sunday | `sunday` | https://approvedreporting.netlify.app/p/1364cd50c5676c52 |
| Tissl | `tissl` | https://approvedreporting.netlify.app/p/434a0f0d771eaa42 |
| Embargo | `embargo` | https://approvedreporting.netlify.app/p/31528ac009d1f8a9 |
| Cocentric | `cocentric` | https://approvedreporting.netlify.app/p/6b5751e0cd1c9df5 |
| Trisaas | `trisaas` | https://approvedreporting.netlify.app/p/f57d2e7474d1d4c1 |
| Urocked | `urocked` | https://approvedreporting.netlify.app/p/07edc0df58f65d0d |
| Cinchio | `cinchio` | https://approvedreporting.netlify.app/p/aeeef30620bd1417 |
| Toast | `toast` | https://approvedreporting.netlify.app/p/aad7a4555fcb298c |
| Monotree | `monotree` | https://approvedreporting.netlify.app/p/19275b94bf9e68bb |
| Rye Energy | `rye-energy` | https://approvedreporting.netlify.app/p/549eb735b4754e83 |
| Stream | `stream` | https://approvedreporting.netlify.app/p/18182c4eb3b5bf9d |
| Zenzap | `zenzap` | https://approvedreporting.netlify.app/p/17e1a852064fb790 |
| Tevalis | `tevalis` | https://approvedreporting.netlify.app/p/83ee0415c9646338 |
| Lloyds | `lloyds` | https://approvedreporting.netlify.app/p/c42fabf94155617a |
| Clearcourse | `clearcourse` | https://approvedreporting.netlify.app/p/258aca68a47006ec |
| Flock X | `flock-x` | https://approvedreporting.netlify.app/p/134a0de873e1e97c |
| Feedality | `feedality` | https://approvedreporting.netlify.app/p/08a8dd66231459d3 |
| Revvue | `revvue` | https://approvedreporting.netlify.app/p/78ca8767940bd992 |

_34 partners. Last updated: 2026-09-04 (added Flock X, Feedality and Revvue. Revvue's slug is `revvue` but Airtable's select option reads "Revvue ai" — an alias group in `src/lib/airtable.ts` accepts both. Flock X has no leads tagged yet and isn't a select option in the Master Lead Sheet stage fields, so their page renders the zero state until one is added.)_
