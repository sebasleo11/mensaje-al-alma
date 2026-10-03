/** Keep in sync with supabase/migrations/202610030001_create_messages.sql. */
export type Message = {
  id: string;
  user_id: string;
  recipient_email: string;
  content_type: 'text' | 'audio' | 'video';
  content_body: string;
  status: 'draft' | 'saved' | 'sent';
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      messages: {
        Row: Message;
        Insert: Omit<Message, 'id' | 'created_at' | 'status'> & {
          id?: string;
          created_at?: string;
          status?: Message['status'];
        };
        Update: Partial<Message>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
