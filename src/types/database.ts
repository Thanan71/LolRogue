export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      champion_enhancements: {
        Row: {
          champion_id: string;
          created_at: string;
          id: string;
          total_candies_spent: number;
          unlocked_nodes: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          champion_id: string;
          created_at?: string;
          id?: string;
          total_candies_spent?: number;
          unlocked_nodes?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          champion_id?: string;
          created_at?: string;
          id?: string;
          total_candies_spent?: number;
          unlocked_nodes?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      champion_mastery: {
        Row: {
          champion_id: string;
          created_at: string;
          current_level_candies: number;
          games_played: number;
          games_won: number;
          id: string;
          mastery_level: number;
          player_id: string;
          total_candies: number;
          total_damage_dealt: number;
          total_kills: number;
          unlocked_ids: string[];
          updated_at: string;
        };
        Insert: {
          champion_id: string;
          created_at?: string;
          current_level_candies?: number;
          games_played?: number;
          games_won?: number;
          id?: string;
          mastery_level?: number;
          player_id: string;
          total_candies?: number;
          total_damage_dealt?: number;
          total_kills?: number;
          unlocked_ids?: string[];
          updated_at?: string;
        };
        Update: {
          champion_id?: string;
          created_at?: string;
          current_level_candies?: number;
          games_played?: number;
          games_won?: number;
          id?: string;
          mastery_level?: number;
          player_id?: string;
          total_candies?: number;
          total_damage_dealt?: number;
          total_kills?: number;
          unlocked_ids?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'champion_mastery_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'admin_player_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'champion_mastery_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'leaderboard';
            referencedColumns: ['player_id'];
          },
          {
            foreignKeyName: 'champion_mastery_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['id'];
          },
        ];
      };
      daily_runs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          daily_date: string;
          daily_seed: number;
          id: string;
          player_id: string;
          run_level_reached: number;
          score: number;
          waves_completed: number;
          won: boolean;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          daily_date: string;
          daily_seed: number;
          id?: string;
          player_id: string;
          run_level_reached?: number;
          score?: number;
          waves_completed?: number;
          won?: boolean;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          daily_date?: string;
          daily_seed?: number;
          id?: string;
          player_id?: string;
          run_level_reached?: number;
          score?: number;
          waves_completed?: number;
          won?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'daily_runs_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'admin_player_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_runs_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'leaderboard';
            referencedColumns: ['player_id'];
          },
          {
            foreignKeyName: 'daily_runs_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['id'];
          },
        ];
      };
      logs: {
        Row: {
          created_at: string;
          details: Json;
          duration_ms: number | null;
          error_message: string | null;
          error_stack: string | null;
          id: string;
          level: string;
          method: string;
          operation: string;
          player_id: string | null;
          repository: string;
          session_id: string;
          table_name: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          details?: Json;
          duration_ms?: number | null;
          error_message?: string | null;
          error_stack?: string | null;
          id?: string;
          level: string;
          method: string;
          operation: string;
          player_id?: string | null;
          repository: string;
          session_id?: string;
          table_name?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          details?: Json;
          duration_ms?: number | null;
          error_message?: string | null;
          error_stack?: string | null;
          id?: string;
          level?: string;
          method?: string;
          operation?: string;
          player_id?: string | null;
          repository?: string;
          session_id?: string;
          table_name?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'logs_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'admin_player_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'logs_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'leaderboard';
            referencedColumns: ['player_id'];
          },
          {
            foreignKeyName: 'logs_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['id'];
          },
        ];
      };
      player_unlocks: {
        Row: {
          champion_id: string | null;
          earned_at: string;
          id: string;
          player_id: string;
          skin_id: string | null;
          unlock_id: string;
          unlock_type: string;
        };
        Insert: {
          champion_id?: string | null;
          earned_at?: string;
          id?: string;
          player_id: string;
          skin_id?: string | null;
          unlock_id: string;
          unlock_type: string;
        };
        Update: {
          champion_id?: string | null;
          earned_at?: string;
          id?: string;
          player_id?: string;
          skin_id?: string | null;
          unlock_id?: string;
          unlock_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'player_unlocks_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'admin_player_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'player_unlocks_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'leaderboard';
            referencedColumns: ['player_id'];
          },
          {
            foreignKeyName: 'player_unlocks_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['id'];
          },
        ];
      };
      players: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          is_admin: boolean;
          last_login_at: string | null;
          level: number;
          total_candies: number;
          total_runs_completed: number;
          total_waves_completed: number;
          total_wins: number;
          updated_at: string;
          user_id: string;
          username: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          is_admin?: boolean;
          last_login_at?: string | null;
          level?: number;
          total_candies?: number;
          total_runs_completed?: number;
          total_waves_completed?: number;
          total_wins?: number;
          updated_at?: string;
          user_id: string;
          username: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          is_admin?: boolean;
          last_login_at?: string | null;
          level?: number;
          total_candies?: number;
          total_runs_completed?: number;
          total_waves_completed?: number;
          total_wins?: number;
          updated_at?: string;
          user_id?: string;
          username?: string;
        };
        Relationships: [];
      };
      run_team_members: {
        Row: {
          champion_id: string;
          created_at: string;
          crowd_control_duration: number;
          cs_score: number;
          damage_dealt: number;
          damage_received: number;
          final_hp: number;
          final_level: number;
          gold_earned: number;
          healing_done: number;
          healing_received: number;
          id: string;
          items_collected: string[];
          kills: number;
          run_id: string;
          survived: boolean;
          time_alive_seconds: number;
        };
        Insert: {
          champion_id: string;
          created_at?: string;
          crowd_control_duration?: number;
          cs_score?: number;
          damage_dealt?: number;
          damage_received?: number;
          final_hp?: number;
          final_level?: number;
          gold_earned?: number;
          healing_done?: number;
          healing_received?: number;
          id?: string;
          items_collected?: string[];
          kills?: number;
          run_id: string;
          survived?: boolean;
          time_alive_seconds?: number;
        };
        Update: {
          champion_id?: string;
          created_at?: string;
          crowd_control_duration?: number;
          cs_score?: number;
          damage_dealt?: number;
          damage_received?: number;
          final_hp?: number;
          final_level?: number;
          gold_earned?: number;
          healing_done?: number;
          healing_received?: number;
          id?: string;
          items_collected?: string[];
          kills?: number;
          run_id?: string;
          survived?: boolean;
          time_alive_seconds?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'run_team_members_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: false;
            referencedRelation: 'runs';
            referencedColumns: ['id'];
          },
        ];
      };
      runs: {
        Row: {
          biomes_visited: string[];
          boss_kills: number;
          candies_earned: number;
          champions_recruited: number;
          combats_lost: number;
          combats_won: number;
          completed_at: string;
          created_at: string;
          duration_seconds: number | null;
          elite_kills: number;
          gold_earned: number;
          id: string;
          items_purchased: number;
          node_types_visited: string[];
          nodes_completed: number;
          player_id: string;
          run_level: number;
          rune_ids: string[];
          augment_ids: string[];
          run_uuid: string;
          seed: number | null;
          started_at: string;
          total_damage_dealt: number;
          total_damage_received: number;
          total_gold_spent: number;
          total_healing_done: number;
          total_healing_received: number;
          total_kills: number;
          waves_completed: number;
          won: boolean;
        };
        Insert: {
          biomes_visited?: string[];
          boss_kills?: number;
          candies_earned?: number;
          champions_recruited?: number;
          combats_lost?: number;
          combats_won?: number;
          completed_at?: string;
          created_at?: string;
          duration_seconds?: number | null;
          elite_kills?: number;
          gold_earned?: number;
          id?: string;
          items_purchased?: number;
          node_types_visited?: string[];
          nodes_completed?: number;
          player_id: string;
          run_level?: number;
          rune_ids?: string[];
          augment_ids?: string[];
          run_uuid: string;
          seed?: number | null;
          started_at?: string;
          total_damage_dealt?: number;
          total_damage_received?: number;
          total_gold_spent?: number;
          total_healing_done?: number;
          total_healing_received?: number;
          total_kills?: number;
          waves_completed?: number;
          won?: boolean;
        };
        Update: {
          biomes_visited?: string[];
          boss_kills?: number;
          candies_earned?: number;
          champions_recruited?: number;
          combats_lost?: number;
          combats_won?: number;
          completed_at?: string;
          created_at?: string;
          duration_seconds?: number | null;
          elite_kills?: number;
          gold_earned?: number;
          id?: string;
          items_purchased?: number;
          node_types_visited?: string[];
          nodes_completed?: number;
          player_id?: string;
          run_level?: number;
          rune_ids?: string[];
          augment_ids?: string[];
          run_uuid?: string;
          seed?: number | null;
          started_at?: string;
          total_damage_dealt?: number;
          total_damage_received?: number;
          total_gold_spent?: number;
          total_healing_done?: number;
          total_healing_received?: number;
          total_kills?: number;
          waves_completed?: number;
          won?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'runs_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'admin_player_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'runs_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'leaderboard';
            referencedColumns: ['player_id'];
          },
          {
            foreignKeyName: 'runs_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      admin_player_stats: {
        Row: {
          created_at: string | null;
          display_name: string | null;
          favorite_champion: string | null;
          id: string | null;
          is_admin: boolean | null;
          last_login_at: string | null;
          level: number | null;
          recent_runs: number | null;
          total_candies: number | null;
          total_runs_completed: number | null;
          total_waves_completed: number | null;
          total_wins: number | null;
          user_id: string | null;
          username: string | null;
          win_rate: number | null;
        };
        Insert: {
          created_at?: string | null;
          display_name?: string | null;
          favorite_champion?: never;
          id?: string | null;
          is_admin?: boolean | null;
          last_login_at?: string | null;
          level?: number | null;
          recent_runs?: never;
          total_candies?: number | null;
          total_runs_completed?: number | null;
          total_waves_completed?: number | null;
          total_wins?: number | null;
          user_id?: string | null;
          username?: string | null;
          win_rate?: never;
        };
        Update: {
          created_at?: string | null;
          display_name?: string | null;
          favorite_champion?: never;
          id?: string | null;
          is_admin?: boolean | null;
          last_login_at?: string | null;
          level?: number | null;
          recent_runs?: never;
          total_candies?: number | null;
          total_runs_completed?: number | null;
          total_waves_completed?: number | null;
          total_wins?: number | null;
          user_id?: string | null;
          username?: string | null;
          win_rate?: never;
        };
        Relationships: [];
      };
      admin_stats: {
        Row: {
          stat_name: string | null;
          stat_value: string | null;
        };
        Relationships: [];
      };
      leaderboard: {
        Row: {
          avatar_url: string | null;
          display_name: string | null;
          last_login_at: string | null;
          level: number | null;
          player_id: string | null;
          total_candies: number | null;
          total_runs_completed: number | null;
          total_waves_completed: number | null;
          total_wins: number | null;
          username: string | null;
          win_rate: number | null;
        };
        Insert: {
          avatar_url?: string | null;
          display_name?: string | null;
          last_login_at?: string | null;
          level?: number | null;
          player_id?: string | null;
          total_candies?: number | null;
          total_runs_completed?: number | null;
          total_waves_completed?: number | null;
          total_wins?: number | null;
          username?: string | null;
          win_rate?: never;
        };
        Update: {
          avatar_url?: string | null;
          display_name?: string | null;
          last_login_at?: string | null;
          level?: number | null;
          player_id?: string | null;
          total_candies?: number | null;
          total_runs_completed?: number | null;
          total_waves_completed?: number | null;
          total_wins?: number | null;
          username?: string | null;
          win_rate?: never;
        };
        Relationships: [];
      };
    };
    Functions: {
      is_current_user_admin: { Args: never; Returns: boolean };
      mastery_current_level_candies: { Args: { p_candies: number }; Returns: number };
      mastery_level_from_candies: { Args: { p_candies: number }; Returns: number };
      mastery_unlock_ids: { Args: { p_candies: number }; Returns: string[] };
      unlock_champion_enhancement: {
        Args: {
          p_candy_cost: number;
          p_champion_id: string;
          p_max_rank: number;
          p_node_id: string;
        };
        Returns: Json;
      };
      save_completed_run: {
        Args: {
          p_mastery: Json;
          p_run: Json;
          p_team_members: Json;
          p_total_candies: number;
        };
        Returns: string;
      };
      save_run_loadout: {
        Args: { p_augment_ids: string[]; p_run_uuid: string; p_rune_ids: string[] };
        Returns: undefined;
      };
      submit_daily_run: {
        Args: {
          p_daily_date: string;
          p_daily_seed: number;
          p_gold: number;
          p_item_count: number;
          p_run_level: number;
          p_waves_completed: number;
          p_won: boolean;
        };
        Returns: {
          completed_at: string | null;
          created_at: string;
          daily_date: string;
          daily_seed: number;
          id: string;
          player_id: string;
          run_level_reached: number;
          score: number;
          waves_completed: number;
          won: boolean;
        };
        SetofOptions: {
          from: '*';
          to: 'daily_runs';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
