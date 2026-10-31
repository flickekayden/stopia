export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_audit: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          detail: Json
          id: string
          target: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          detail?: Json
          id?: string
          target?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          detail?: Json
          id?: string
          target?: string | null
        }
        Relationships: []
      }
      admin_invites: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          created_at: string
          label: string
          room_id: string | null
          status: string
          updated_at: string
          usage_key: string
          wallet_id: string
        }
        Insert: {
          created_at?: string
          label?: string
          room_id?: string | null
          status: string
          updated_at?: string
          usage_key: string
          wallet_id: string
        }
        Update: {
          created_at?: string
          label?: string
          room_id?: string | null
          status?: string
          updated_at?: string
          usage_key?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "credit_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      answers: {
        Row: {
          finished: boolean
          id: string
          player_id: string
          round_id: string
          updated_at: string
          values: Json
        }
        Insert: {
          finished?: boolean
          id?: string
          player_id: string
          round_id: string
          updated_at?: string
          values?: Json
        }
        Update: {
          finished?: boolean
          id?: string
          player_id?: string
          round_id?: string
          updated_at?: string
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "answers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      category_presets: {
        Row: {
          categories: string[]
          created_at: string
          id: string
          name: string
        }
        Insert: {
          categories: string[]
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          categories?: string[]
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          player_id: string
          quote: Json | null
          room_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          player_id: string
          quote?: Json | null
          room_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          player_id?: string
          quote?: Json | null
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reports: {
        Row: {
          created_at: string
          detail: string
          excerpt: string
          id: string
          message_id: string | null
          reason: string
          reporter_player_id: string | null
          room_code: string
          room_id: string | null
          status: string
          target_nickname: string
          target_player_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: string
          excerpt?: string
          id?: string
          message_id?: string | null
          reason: string
          reporter_player_id?: string | null
          room_code?: string
          room_id?: string | null
          status?: string
          target_nickname?: string
          target_player_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: string
          excerpt?: string
          id?: string
          message_id?: string | null
          reason?: string
          reporter_player_id?: string | null
          room_code?: string
          room_id?: string | null
          status?: string
          target_nickname?: string
          target_player_id?: string | null
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          actor_user_id: string | null
          balance_after: number
          created_at: string
          delta: number
          id: string
          kind: string
          note: string | null
          reference: string | null
          wallet_id: string
        }
        Insert: {
          actor_user_id?: string | null
          balance_after: number
          created_at?: string
          delta: number
          id?: string
          kind: string
          note?: string | null
          reference?: string | null
          wallet_id: string
        }
        Update: {
          actor_user_id?: string | null
          balance_after?: number
          created_at?: string
          delta?: number
          id?: string
          kind?: string
          note?: string | null
          reference?: string | null
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "credit_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_wallets: {
        Row: {
          balance: number
          consumed_total: number
          created_at: string
          free_granted: number
          guest_token_hash: string | null
          id: string
          merged_into: string | null
          purchased_total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          balance?: number
          consumed_total?: number
          created_at?: string
          free_granted?: number
          guest_token_hash?: string | null
          id?: string
          merged_into?: string | null
          purchased_total?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          balance?: number
          consumed_total?: number
          created_at?: string
          free_granted?: number
          guest_token_hash?: string | null
          id?: string
          merged_into?: string | null
          purchased_total?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_wallets_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "credit_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      party_chat: {
        Row: {
          content: string
          created_at: string
          id: string
          nickname: string
          player_id: string | null
          room_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          nickname: string
          player_id?: string | null
          room_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          nickname?: string
          player_id?: string | null
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_chat_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "party_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_chat_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "party_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      party_players: {
        Row: {
          created_at: string
          id: string
          is_bot: boolean
          is_host: boolean
          last_seen: string
          nickname: string
          room_id: string
          score: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_bot?: boolean
          is_host?: boolean
          last_seen?: string
          nickname: string
          room_id: string
          score?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_bot?: boolean
          is_host?: boolean
          last_seen?: string
          nickname?: string
          room_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "party_players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "party_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      party_private: {
        Row: {
          data: Json
          room_id: string
          round_number: number
        }
        Insert: {
          data?: Json
          room_id: string
          round_number: number
        }
        Update: {
          data?: Json
          room_id?: string
          round_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "party_private_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "party_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      party_rate_events: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          kind: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          kind: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          kind?: string
        }
        Relationships: []
      }
      party_room_billing: {
        Row: {
          created_at: string
          room_id: string
          wallet_id: string
        }
        Insert: {
          created_at?: string
          room_id: string
          wallet_id: string
        }
        Update: {
          created_at?: string
          room_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_room_billing_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "party_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_room_billing_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "credit_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      party_rooms: {
        Row: {
          code: string
          created_at: string
          game: string
          id: string
          phase: string
          phase_ends_at: string | null
          phase_started_at: string | null
          public_state: Json
          round_number: number
          settings: Json
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          game?: string
          id?: string
          phase?: string
          phase_ends_at?: string | null
          phase_started_at?: string | null
          public_state?: Json
          round_number?: number
          settings?: Json
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          game?: string
          id?: string
          phase?: string
          phase_ends_at?: string | null
          phase_started_at?: string | null
          public_state?: Json
          round_number?: number
          settings?: Json
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      party_sessions: {
        Row: {
          player_id: string
          room_id: string
          session_hash: string
        }
        Insert: {
          player_id: string
          room_id: string
          session_hash: string
        }
        Update: {
          player_id?: string
          room_id?: string
          session_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_sessions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "party_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "party_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      party_submissions: {
        Row: {
          created_at: string
          id: string
          payload: Json
          phase: string
          player_id: string
          room_id: string
          round_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          phase: string
          player_id: string
          room_id: string
          round_number: number
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          phase?: string
          player_id?: string
          room_id?: string
          round_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "party_submissions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "party_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_submissions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "party_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          confirmed_at: string | null
          created_at: string
          credits: number
          error: string | null
          id: string
          order_id: string | null
          platform: string
          price_label: string
          product_id: string
          purchase_token: string | null
          purchase_token_hash: string | null
          status: string
          updated_at: string
          wallet_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          credits: number
          error?: string | null
          id?: string
          order_id?: string | null
          platform: string
          price_label?: string
          product_id: string
          purchase_token?: string | null
          purchase_token_hash?: string | null
          status?: string
          updated_at?: string
          wallet_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          credits?: number
          error?: string | null
          id?: string
          order_id?: string | null
          platform?: string
          price_label?: string
          product_id?: string
          purchase_token?: string | null
          purchase_token_hash?: string | null
          status?: string
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "credit_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          id: string
          is_host: boolean
          is_online: boolean
          last_seen: string
          nickname: string
          ready_round: number
          room_id: string
          score: number
          session_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_host?: boolean
          is_online?: boolean
          last_seen?: string
          nickname: string
          ready_round?: number
          room_id: string
          score?: number
          session_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_host?: boolean
          is_online?: boolean
          last_seen?: string
          nickname?: string
          ready_round?: number
          room_id?: string
          score?: number
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar: string
          created_at: string
          display_name: string
          id: string
          terms_accepted_at: string | null
          updated_at: string
        }
        Insert: {
          avatar?: string
          created_at?: string
          display_name?: string
          id: string
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar?: string
          created_at?: string
          display_name?: string
          id?: string
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      room_voice_notes: {
        Row: {
          created_at: string
          duration_ms: number
          id: string
          nickname: string
          player_id: string
          room_id: string
          round_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          duration_ms: number
          id?: string
          nickname: string
          player_id: string
          room_id: string
          round_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          id?: string
          nickname?: string
          player_id?: string
          room_id?: string
          round_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_voice_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_voice_notes_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_voice_notes_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          categories: string[]
          category_usage: Json
          code: string
          created_at: string
          current_round: number
          excluded_letters: string[]
          final_analysis: Json | null
          host_player_id: string | null
          id: string
          status: string
          stop_policy: string
          timer_enabled: boolean
          timer_seconds: number
          total_rounds: number
          used_letters: string[]
        }
        Insert: {
          categories?: string[]
          category_usage?: Json
          code: string
          created_at?: string
          current_round?: number
          excluded_letters?: string[]
          final_analysis?: Json | null
          host_player_id?: string | null
          id?: string
          status?: string
          stop_policy?: string
          timer_enabled?: boolean
          timer_seconds?: number
          total_rounds?: number
          used_letters?: string[]
        }
        Update: {
          categories?: string[]
          category_usage?: Json
          code?: string
          created_at?: string
          current_round?: number
          excluded_letters?: string[]
          final_analysis?: Json | null
          host_player_id?: string | null
          id?: string
          status?: string
          stop_policy?: string
          timer_enabled?: boolean
          timer_seconds?: number
          total_rounds?: number
          used_letters?: string[]
        }
        Relationships: []
      }
      rounds: {
        Row: {
          categories: string[]
          ends_at: string | null
          evaluation: Json | null
          id: string
          letter: string
          number: number
          room_id: string
          started_at: string
          status: string
          stop_requested_at: string | null
          stopped_by: string | null
        }
        Insert: {
          categories: string[]
          ends_at?: string | null
          evaluation?: Json | null
          id?: string
          letter: string
          number: number
          room_id: string
          started_at?: string
          status?: string
          stop_requested_at?: string | null
          stopped_by?: string | null
        }
        Update: {
          categories?: string[]
          ends_at?: string | null
          evaluation?: Json | null
          id?: string
          letter?: string
          number?: number
          room_id?: string
          started_at?: string
          status?: string
          stop_requested_at?: string | null
          stopped_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rounds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      credit_apply: {
        Args: {
          p_actor: string
          p_delta: number
          p_kind: string
          p_note: string
          p_reference: string
          p_wallet: string
        }
        Returns: number
      }
      credit_consume: {
        Args: {
          p_key: string
          p_label: string
          p_room: string
          p_wallet: string
        }
        Returns: string
      }
      credit_refund: {
        Args: { p_key: string; p_wallet: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
