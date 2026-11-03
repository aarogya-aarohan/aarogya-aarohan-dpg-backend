import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
import type {
  Bundle,
  ExtractResource,
  OperationOutcome,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import { ClsService } from 'nestjs-cls';
import { OperationOutcomeError } from '@medplum/core';
import qs from 'qs';

export class FhirClient {
  private readonly logger = new Logger(FhirClient.name);
  private accessToken?: string;
  private accessTokenExpires?: DateTime;
  private readonly client: AxiosInstance;

  constructor(
    private readonly fhirUrl: string,
    private readonly tokenUrl: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly clsService: ClsService
  ) {
    this.client = axios.create({
      baseURL: fhirUrl,
      paramsSerializer: (params) =>
        qs.stringify(params, { arrayFormat: 'repeat' }),
    });
    this.client.interceptors.request.use(async (config) => {
      config.headers.Authorization = `Bearer ${await this.getToken()}`;
      config.headers['Cache-Control'] = 'no-cache';
      return config;
    });
  }

  private async getToken() {
    // This extract the token which is set a request level using CLS
    // This is not a global variable, Value of this will change depending
    // on the request
    const userToken = this.clsService.get<string>('userToken');
    if (typeof userToken === 'string') return userToken;

    if (
      !this.accessToken ||
      !this.accessTokenExpires ||
      this.accessTokenExpires <= DateTime.now()
    ) {
      const myHeaders = new Headers();
      myHeaders.append('Content-Type', 'application/x-www-form-urlencoded');

      const urlencoded = new URLSearchParams();
      urlencoded.append('grant_type', 'client_credentials');
      urlencoded.append('client_id', this.clientId);
      urlencoded.append('client_secret', this.clientSecret);

      const requestOptions = {
        method: 'POST',
        headers: myHeaders,
        body: urlencoded,
        redirect: 'follow',
      } as const;

      const response = await fetch(this.tokenUrl, requestOptions);
      const data = (await response.json()) as Record<string, unknown>;
      this.accessToken = data.access_token as string;
      const second = data.expires_in as number;
      this.accessTokenExpires = DateTime.now().plus({ second });
    }
    return this.accessToken;
  }

  async instanceOp<Return extends Resource = Bundle>(
    type: ResourceType,
    id: string,
    op: string,
    payload?: Record<string, unknown>,
    params?: Record<string, unknown>
  ) {
    if (payload) {
      return await this.client
        .post<Bundle>(`/${type}/${id}/${op}`, payload, { params })
        .then((r) => this.toFhirResponse(r) as Return)
        .catch((err) => this.toFhirResponse(err) as Return);
    }

    return await this.client
      .get<Bundle>(`/${type}/${id}/${op}`, { params })
      .then((r) => this.toFhirResponse(r) as Bundle)
      .catch((err) => this.toFhirResponse(err) as Bundle);
  }

  async resourceOp<Return extends Resource = Bundle>(
    type: ResourceType,
    op: string,
    payload?: Record<string, unknown>
  ) {
    if (payload) {
      return await this.client
        .post<Bundle>(`/${type}/${op}`, payload)
        .then((r) => this.toFhirResponse(r) as Return)
        .catch((err) => this.toFhirResponse(err) as Return);
    }

    return await this.client
      .get<Bundle>(`/${type}/${op}`)
      .then((r) => this.toFhirResponse(r) as Bundle)
      .catch((err) => this.toFhirResponse(err) as Bundle);
  }

  async binaryUpload(
    type: ResourceType,
    id: string,
    path: string,
    contentType: string,
    payload: ArrayBufferLike
  ) {
    const op = '$binary-access-write';
    const url = new URL(this.fhirUrl);
    url.pathname = `/fhir/${type}/${id}/${op}`;
    url.searchParams.set('path', path);

    const requestOptions = {
      headers: {
        authorization: `Bearer ${await this.getToken()}`,
        'content-type': contentType,
      },
      method: 'POST',
      body: payload,
    };

    const response = await fetch(url, requestOptions);
    if (!response.ok) {
      this.logger.error('Failed to binary upload');
      this.logger.error('Failure reason', await response.text());
      throw new Error('Cannot upload binary');
    }
  }

  async read<K extends ResourceType>(type: K, id: string) {
    return await this.client
      .get<ExtractResource<K>>(`/${type}/${id}`)
      .then((r) => this.toFhirResponse(r))
      .catch((err) => this.toFhirResponse(err) as ExtractResource<K>);
  }

  async delete<K extends ResourceType>(type: K, id: string) {
    return await this.client
      .delete<ExtractResource<K>>(`/${type}/${id}`)
      .then((r) => this.toFhirResponse(r))
      .catch((err) => this.toFhirResponse(err) as ExtractResource<K>);
  }

  async search<K extends ResourceType>(
    type: K,
    params?: Record<string, unknown>
  ) {
    return await this.client
      .get<Bundle<ExtractResource<K>>>(`/${type}`, { params })
      .then((r) => this.toFhirResponse(r) as Bundle<ExtractResource<K>>)
      .catch((err) => this.toFhirResponse(err) as Bundle<ExtractResource<K>>);
  }

  async transaction<T extends Resource>(data: Bundle<T>) {
    return await this.client
      .post<Bundle<T>>(`/`, data)
      .then((r) => this.toFhirResponse(r))
      .catch((err) => this.toFhirResponse(err) as Resource);
  }

  async upsert(data: Resource, options?: { headers?: Record<string, string> }) {
    return await this.client
      .put<Resource>(`/${data.resourceType}/${data.id}`, data, options)
      .then((r) => this.toFhirResponse(r))
      .catch((err) => this.toFhirResponse(err) as Resource);
  }

  toFhirResponse<T>(r: AxiosResponse<T> | AxiosError<unknown, T>): T {
    if (r instanceof AxiosError) {
      this.logger.error('FHIR ERROR', { status: r.status });
      if (
        r.status &&
        r.response?.data?.['resourceType'] === 'OperationOutcome'
      ) {
        this.logger.error(JSON.stringify(r.response.data));
        throw new OperationOutcomeError(r.response.data as OperationOutcome);
      }
      throw r;
    }
    return r.data as T;
  }
}
