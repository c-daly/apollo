
# HealthResponse


## Properties

Name | Type
------------ | -------------
`status` | string
`neo4j` | string
`milvus` | string
`version` | string

## Example

```typescript
import type { HealthResponse } from '@logos/sophia-sdk'

// TODO: Update the object below with actual values
const example = {
  "status": healthy,
  "neo4j": connected,
  "milvus": connected,
  "version": 0.2.0,
} satisfies HealthResponse

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as HealthResponse
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


