
# PlanResponse


## Properties

Name | Type
------------ | -------------
`planId` | string
`status` | string
`submittedAt` | Date
`diagnostics` | Array&lt;string&gt;
`states` | [Array&lt;CWMState&gt;](CWMState.md)

## Example

```typescript
import type { PlanResponse } from '@logos/sophia-sdk'

// TODO: Update the object below with actual values
const example = {
  "planId": null,
  "status": null,
  "submittedAt": null,
  "diagnostics": null,
  "states": null,
} satisfies PlanResponse

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PlanResponse
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


