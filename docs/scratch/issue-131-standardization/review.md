# Code Review: Apollo #131 Standardization

## Summary
**PASS** - All issues resolved.

## Issues Found

### [RESOLVED] Port exports now respect env overrides

**Original behavior:**
```python
NEO4J_HTTP_PORT = os.getenv("NEO4J_HTTP_PORT", "27474")
```

**Fixed behavior:**
```python
NEO4J_HTTP_PORT = get_env_value("NEO4J_HTTP_PORT", _env, str(APOLLO_PORTS.neo4j_http))
```
- `get_env_value` checks OS env first, then _env dict, then APOLLO_PORTS default
- Preserves original OS environment override capability
- Matches behavior of other LOGOS repos

### [NIT] Comment removed without replacement

The misleading comment was correctly removed. No replacement needed since the code is self-documenting.

## Scope Compliance
- All changes justified by spec: **YES**
- Unjustified additions: None

## Positive Notes
- Clean use of apollo.env module
- Good backward-compat exports for other test files
- Proper module-level config loading
- OS env override capability preserved
- Comments updated to reflect new pattern
