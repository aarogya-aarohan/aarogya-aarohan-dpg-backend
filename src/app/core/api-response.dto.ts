export abstract class ApiSuccessResponse<T> {
  status: 'ok';
  data: T;
}
