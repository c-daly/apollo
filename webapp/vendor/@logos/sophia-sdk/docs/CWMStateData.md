
# CWMStateData

Model-specific payload

## Properties

Name | Type
------------ | -------------
`entities` | Array&lt;object&gt;
`relations` | Array&lt;object&gt;
`violations` | Array&lt;string&gt;
`validation` | [CWMAGraphDataValidation](CWMAGraphDataValidation.md)
`imagined` | boolean
`horizonSteps` | number
`frames` | Array&lt;string&gt;
`embeddings` | Array&lt;number&gt;
`assumptions` | Array&lt;string&gt;
`sentiment` | string
`confidenceDelta` | number
`cautionDelta` | number
`narrative` | string

## Example

```typescript
import type { CWMStateData } from '@logos/sophia-sdk'

// TODO: Update the object below with actual values
const example = {
  "entities": null,
  "relations": null,
  "violations": null,
  "validation": null,
  "imagined": null,
  "horizonSteps": null,
  "frames": null,
  "embeddings": null,
  "assumptions": null,
  "sentiment": null,
  "confidenceDelta": null,
  "cautionDelta": null,
  "narrative": null,
} satisfies CWMStateData

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CWMStateData
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


