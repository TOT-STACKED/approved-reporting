# Partner secure links

Each partner has a private, unguessable dashboard at
`https://partners.wearestacked.io/p/<token>`. No password needed —
the token *is* the credential, so treat these URLs like secrets and only
share each one with its own partner.

The portal moved to `partners.wearestacked.io` on 9 Sep 2026. The old
`approvedreporting.netlify.app` host still serves the same pages, so links
already sent to partners keep working — but send the new one from here on.

The live mapping is the `PARTNER_TOKENS` env var in Netlify
(`{ "<token>": "<partner-slug>" }`). This file is just a human-readable
record — **Netlify is the source of truth**. If you rotate or add a
token, update Netlify *and* this file.

To add a partner: generate a token with `openssl rand -hex 8`, map it to
the partner's slug (lowercased name, spaces → hyphens) in `PARTNER_TOKENS`,
redeploy, then add a row here.

| Partner | Slug | Link |
|---|---|---|
| SKY | `sky` | https://partners.wearestacked.io/p/120ee92aee11ab71 |
| Workforce | `workforce` | https://partners.wearestacked.io/p/897828b7ed7184da |
| Bizimply | `bizimply` | https://partners.wearestacked.io/p/d6d87f25ef0692b7 |
| Square | `square` | https://partners.wearestacked.io/p/f074b577c4b8e13f |
| Lightspeed | `lightspeed` | https://partners.wearestacked.io/p/0d4309316d6c25e4 |
| WRS | `wrs` | https://partners.wearestacked.io/p/e597414a81b05a57 |
| Sona | `sona` | https://partners.wearestacked.io/p/0c2d2e245c13d685 |
| Deputy | `deputy` | https://partners.wearestacked.io/p/6871a8b66627e9a1 |
| Nory | `nory` | https://partners.wearestacked.io/p/85ea2ea260cae75c |
| Stampede | `stampede` | https://partners.wearestacked.io/p/246bb2246599ed06 |
| Fourth | `fourth` | https://partners.wearestacked.io/p/3c973ae0de7ce497 |
| Tenzo | `tenzo` | https://partners.wearestacked.io/p/4a89921bb5dcb5eb |
| Como | `como` | https://partners.wearestacked.io/p/f8645d8499a62582 |
| Storekit | `storekit` | https://partners.wearestacked.io/p/8dacee449792aa77 |
| Tayl | `tayl` | https://partners.wearestacked.io/p/3759ea1576c8bfe3 |
| Apicbase | `apicbase` | https://partners.wearestacked.io/p/cb1da4163286213f |
| Sunday | `sunday` | https://partners.wearestacked.io/p/1364cd50c5676c52 |
| Tissl | `tissl` | https://partners.wearestacked.io/p/434a0f0d771eaa42 |
| Embargo | `embargo` | https://partners.wearestacked.io/p/31528ac009d1f8a9 |
| Cocentric | `cocentric` | https://partners.wearestacked.io/p/6b5751e0cd1c9df5 |
| Trisaas | `trisaas` | https://partners.wearestacked.io/p/f57d2e7474d1d4c1 |
| Urocked | `urocked` | https://partners.wearestacked.io/p/07edc0df58f65d0d |
| Cinchio | `cinchio` | https://partners.wearestacked.io/p/aeeef30620bd1417 |
| Toast | `toast` | https://partners.wearestacked.io/p/aad7a4555fcb298c |
| Monotree | `monotree` | https://partners.wearestacked.io/p/19275b94bf9e68bb |
| Rye Energy | `rye-energy` | https://partners.wearestacked.io/p/549eb735b4754e83 |
| Stream | `stream` | https://partners.wearestacked.io/p/18182c4eb3b5bf9d |
| Zenzap | `zenzap` | https://partners.wearestacked.io/p/17e1a852064fb790 |
| Tevalis | `tevalis` | https://partners.wearestacked.io/p/83ee0415c9646338 |
| Lloyds | `lloyds` | https://partners.wearestacked.io/p/c42fabf94155617a |
| Clearcourse | `clearcourse` | https://partners.wearestacked.io/p/258aca68a47006ec |
| Flock X | `flock-x` | https://partners.wearestacked.io/p/134a0de873e1e97c |
| Feedality | `feedality` | https://partners.wearestacked.io/p/08a8dd66231459d3 |
| Revvue | `revvue` | https://partners.wearestacked.io/p/78ca8767940bd992 |
| Planday | `planday` | https://partners.wearestacked.io/p/d775f98afeb002d1 |

_35 partners. Last updated: 2026-09-04 (added Flock X, Feedality, Revvue and Planday. Revvue's slug is `revvue` but Airtable's select option reads "Revvue ai" — an alias group in `src/lib/airtable.ts` accepts both. Flock X has no leads tagged yet and isn't a select option in the Master Lead Sheet stage fields, so their page renders the zero state until one is added.)_
