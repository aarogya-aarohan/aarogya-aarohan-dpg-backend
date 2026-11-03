import { ApiSuccessResponse } from '../../core/api-response.dto';

type Data = {
  total: number;
  completed: number;
  pending: number;
};

export class ReaderStatsResponse extends ApiSuccessResponse<Data> {}
