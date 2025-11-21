
# CWMGImaginedData

Payload for CWM-G (grounded/JEPA) outputs.

## Properties

Name | Type
------------ | -------------
`imagined` | boolean
`horizonSteps` | number
`frames` | Array&lt;string&gt;
`embeddings` | Array&lt;number&gt;
`assumptions` | Array&lt;string&gt;

## Example

```typescript
import type { CWMGImaginedData } from '@logos/sophia-sdk'

// TODO: Update the object below with actual values
const example = {
  "imagined": null,
  "horizonSteps": null,
  "frames": null,
  "embeddings": null,
  "assumptions": null,
} satisfies CWMGImaginedData

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CWMGImaginedData
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


