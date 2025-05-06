const API_URL = 'http://localhost:8000/api'

export type RequestOptions = {
  method : 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  endpoint : string,
  credentials? : RequestCredentials,
  headers? : Record<string, string>,
  params? : Record<string, string>,
  body? : any,
  requiresAuth? : boolean,
}

export async function apiRequest (options : RequestOptions) {
  const requestOptions : RequestInit = {
    method: options.method,
    body: options.body,
  }

  if (options.headers) {
    requestOptions.headers = options.headers;
  } else {
    requestOptions.headers = {};
  }

  if (!options.credentials) {
    requestOptions.credentials = 'include';
  }

  if (!options.endpoint ||
    options.endpoint === '' ||
    options.endpoint === '/' ||
    !options.endpoint.startsWith('/')
  ) {
    throw new Error('Invalid endpoint');
  }

  if (options.params) {
    options.endpoint += '?' + new URLSearchParams(options.params);
  }

  return fetch(`${API_URL}${options.endpoint}`, requestOptions);
}

export async function jsonRequest (options : RequestOptions) {
  if (!options.headers) {
    options.headers = {};
  }

  options.headers['Content-Type'] = 'application/json';

  if (options.body && !(typeof options.body === 'string')) {
    options.body = JSON.stringify(options.body);
  }

  return apiRequest(options);
}
