
# PlanRequest


## Properties

Name | Type
------------ | -------------
`goal` | string
`context` | { [key: string]: any; }
`constraints` | Array&lt;string&gt;
`priority` | string
`metadata` | { [key: string]: any; }

## Example

```typescript
import type { PlanRequest } from '@logos/sophia-sdk'

// TODO: Update the object below with actual values
const example = {
  "goal": null,
  "context": null,
  "constraints": null,
  "priority": P1,
  "metadata": null,
} satisfies PlanRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as PlanRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


