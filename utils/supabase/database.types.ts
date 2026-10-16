/** Keep in sync with supabase/migrations. */
export type ContentType = 'text' | 'audio' | 'video' | 'photo';
export type Message = {
  id: string; user_id: string; recipient_email: string; content_type: ContentType;
  content_body: string; status: 'draft' | 'saved' | 'sent'; created_at: string; updated_at: string; archived_at: string | null;
};
export type Asset = { id: string; message_id: string; user_id: string; path: string; mime: string; bytes: number; duration: number | null; removed_at: string | null; state: 'pending' | 'ready' | 'deleting'; created_at: string };
export type AttemptState = 'prepared' | 'sending' | 'uncertain' | 'accepted' | 'delivered' | 'bounced' | 'failed';
export type SendAttempt = { id: string; message_id: string; user_id: string; recipient_email: string; content_type: ContentType; content_body: string; asset_id: string | null; email_payload: Record<string, unknown> | null; sender: string; app_url: string; state: AttemptState; provider_id: string | null; lease_until: string | null; revoked_at: string | null; created_at: string; updated_at: string };
export type MessageQuota = { limit:number; additional:number; used:number; remaining:number };
export type MessageSchedule = { id:string; message_id:string; user_id:string; scheduled_at:string; time_zone:string; local_datetime:string; utc_offset_minutes:number; message_updated_at:string; asset_id:string|null; version:number; state:'scheduled'|'blocked'|'dispatching'|'finished'|'cancelled'; attempt_id:string|null; started_at:string|null; cancelled_at:string|null; created_at:string; updated_at:string; last_error_code:string|null; confirmation:Record<string,unknown> };
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };
export type Database = {
 public: { Tables: {
  messages: Table<Message, Omit<Message,'id'|'created_at'|'updated_at'|'status'|'archived_at'> & { id?: string; created_at?: string; updated_at?: string; status?: Message['status'] }>;
  message_schedules: Table<MessageSchedule>;
  message_assets: Table<Asset>;
  message_send_attempts: Table<SendAttempt>;
  message_send_accounts: Table<{ user_id: string; created_at: string }>;
 }; Views: { [_ in never]: never }; Functions: {
  change_message_schedule: { Args: {p_user:string;p_message:string;p_id:string;p_action:string;p_expected:string|null;p_version:number|null;p_at:string|null;p_zone:string|null;p_local:string|null;p_offset:number|null}; Returns: MessageSchedule };
  begin_message_schedule: {Args:{p_user:string;p_message:string;p_id:string;p_version:number;p_sender:string;p_app_url:string};Returns:SendAttempt|null};
  get_message_quota: { Args: Record<string,never>; Returns: MessageQuota };
  orphan_message_assets: { Args: Record<string, never>; Returns: {id:string;user_id:string}[] };
  message_locked: { Args: { p_id: string }; Returns: boolean };
  reserve_message_send: { Args: { p_user: string; p_message: string; p_sender: string; p_app_url: string; p_expected: string }; Returns: SendAttempt };
  claim_message_send: { Args: { p_attempt: string }; Returns: { attempt: SendAttempt; replay: boolean } | null };
  finish_message_send: { Args: { p_attempt: string; p_state: string; p_provider?: string | null }; Returns: undefined };
  reserve_message_asset: { Args: { p_user: string; p_message: string; p_mime: string; p_bytes: number; p_ext: string }; Returns: Asset };
  complete_message_asset: { Args: { p_user: string; p_asset: string; p_bytes: number; p_duration: number | null }; Returns: undefined };
  mark_asset_cleanup: { Args: { p_user: string; p_asset: string; p_expired_only?: boolean }; Returns: string | null };
 }; Enums: { [_ in never]: never }; CompositeTypes: { [_ in never]: never } };
};
