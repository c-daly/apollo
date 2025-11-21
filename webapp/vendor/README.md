# Vendored LOGOS SDKs

This directory includes a snapshot of the generated TypeScript SDKs from the
[`c-daly/logos`](https://github.com/c-daly/logos) repository so CI environments
that only clone `apollo` can still build/run the webapp without fetching an
adjacent repo.

- `@logos/sophia-sdk`: copied from `logos@sdk-web/sophia` commit
  `9549b089203ed1d8bb6560ab56ba02e7dbbefb61`
- `@logos/hermes-sdk`: copied from `logos@sdk-web/hermes` commit
  `9549b089203ed1d8bb6560ab56ba02e7dbbefb61`

To refresh these packages after the OpenAPI contracts change:

```bash
# From the apollo repo root, assuming ../logos points to the desired commit
rm -rf webapp/vendor
mkdir -p webapp/vendor/@logos
rsync -a --exclude node_modules ../logos/sdk-web/sophia/ webapp/vendor/@logos/sophia-sdk
rsync -a --exclude node_modules ../logos/sdk-web/hermes/ webapp/vendor/@logos/hermes-sdk
npm install --prefix webapp
```

Please keep the commit hash in this README and in
`docs/API_CLIENTS.md` up-to-date so we know which snapshot is synced.
