
# CWMAGraphData

Payload for CWM-A (abstract reasoning) outputs.

## Properties

Name | Type
------------ | -------------
`entities` | Array&lt;object&gt;
`relations` | Array&lt;object&gt;
`violations` | Array&lt;string&gt;
`validation` | [CWMAGraphDataValidation](CWMAGraphDataValidation.md)

## Example

```typescript
import type { CWMAGraphData } from '@logos/sophia-sdk'

// TODO: Update the object below with actual values
const example = {
  "entities": null,
  "relations": null,
  "violations": null,
  "validation": null,
} satisfies CWMAGraphData

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CWMAGraphData
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


