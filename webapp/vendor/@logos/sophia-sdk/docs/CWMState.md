
# CWMState

Unified causal world model state envelope.

## Properties

Name | Type
------------ | -------------
`stateId` | string
`modelType` | string
`source` | string
`timestamp` | Date
`confidence` | number
`status` | string
`links` | [CWMStateLinks](CWMStateLinks.md)
`tags` | Array&lt;string&gt;
`data` | [CWMStateData](CWMStateData.md)

## Example

```typescript
import type { CWMState } from '@logos/sophia-sdk'

// TODO: Update the object below with actual values
const example = {
  "stateId": null,
  "modelType": null,
  "source": null,
  "timestamp": null,
  "confidence": null,
  "status": null,
  "links": null,
  "tags": null,
  "data": null,
} satisfies CWMState

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CWMState
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


