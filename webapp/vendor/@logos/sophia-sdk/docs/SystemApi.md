# SystemApi

All URIs are relative to *http://localhost:8000*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**healthCheck**](SystemApi.md#healthcheck) | **GET** /health | Health check |



## healthCheck

> HealthResponse healthCheck()

Health check

Returns service status and dependency connectivity.

### Example

```ts
import {
  Configuration,
  SystemApi,
} from '@logos/sophia-sdk';
import type { HealthCheckRequest } from '@logos/sophia-sdk';

async function example() {
  console.log("🚀 Testing @logos/sophia-sdk SDK...");
  const api = new SystemApi();

  try {
    const data = await api.healthCheck();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**HealthResponse**](HealthResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Service is healthy |  -  |
| **500** | Service unavailable |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

