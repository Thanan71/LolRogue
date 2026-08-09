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
          total_assists: number;
          total_candies: number;
          total_damage_dealt: number;
          total_damage_received: number;
          total_healing_done: number;
          total_kills: number;
          total_shielding_done: number;
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
          total_assists?: number;
          total_candies?: number;
          total_damage_dealt?: number;
          total_damage_received?: number;
          total_healing_done?: number;
          total_kills?: number;
          total_shielding_done?: number;
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
          total_assists?: number;
          total_candies?: number;
          total_damage_dealt?: number;
          total_damage_received?: number;
          total_healing_done?: number;
          total_kills?: number;
          total_shielding_done?: number;
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
            referencedRelation: 'players';
            referencedColumns: ['id'];
          },
        ];
      };
      daily_challenge_rulesets: {
        Row: {
          biome_points: number;
          code: string;
          created_at: string;
          difficulty: string;
          gameplay_ruleset_version: number;
          gold_points: number;
          is_active: boolean;
          run_level_points: number;
          score_version: number;
          seed_namespace: string;
          version: number;
          victory_bonus: number;
          wave_points: number;
        };
        Insert: {
          biome_points: number;
          code: string;
          created_at?: string;
          difficulty: string;
          gameplay_ruleset_version: number;
          gold_points: number;
          is_active?: boolean;
          run_level_points: number;
          score_version: number;
          seed_namespace: string;
          version: number;
          victory_bonus: number;
          wave_points: number;
        };
        Update: {
          biome_points?: number;
          code?: string;
          created_at?: string;
          difficulty?: string;
          gameplay_ruleset_version?: number;
          gold_points?: number;
          is_active?: boolean;
          run_level_points?: number;
          score_version?: number;
          seed_namespace?: string;
          version?: number;
          victory_bonus?: number;
          wave_points?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'daily_challenge_rulesets_gameplay_ruleset_version_fkey';
            columns: ['gameplay_ruleset_version'];
            isOneToOne: false;
            referencedRelation: 'gameplay_rulesets';
            referencedColumns: ['version'];
          },
        ];
      };
      daily_runs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          daily_date: string;
          daily_ruleset_version: number | null;
          daily_seed: number;
          gameplay_ruleset_version: number | null;
          id: string;
          invalidated_at: string | null;
          invalidated_by: string | null;
          invalidation_reason: string | null;
          player_id: string;
          run_attempt_id: string | null;
          run_id: string | null;
          run_level_reached: number;
          score: number;
          score_version: number | null;
          waves_completed: number;
          won: boolean;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          daily_date: string;
          daily_ruleset_version?: number | null;
          daily_seed: number;
          gameplay_ruleset_version?: number | null;
          id?: string;
          invalidated_at?: string | null;
          invalidated_by?: string | null;
          invalidation_reason?: string | null;
          player_id: string;
          run_attempt_id?: string | null;
          run_id?: string | null;
          run_level_reached?: number;
          score?: number;
          score_version?: number | null;
          waves_completed?: number;
          won?: boolean;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          daily_date?: string;
          daily_ruleset_version?: number | null;
          daily_seed?: number;
          gameplay_ruleset_version?: number | null;
          id?: string;
          invalidated_at?: string | null;
          invalidated_by?: string | null;
          invalidation_reason?: string | null;
          player_id?: string;
          run_attempt_id?: string | null;
          run_id?: string | null;
          run_level_reached?: number;
          score?: number;
          score_version?: number | null;
          waves_completed?: number;
          won?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'daily_runs_daily_ruleset_version_fkey';
            columns: ['daily_ruleset_version'];
            isOneToOne: false;
            referencedRelation: 'daily_challenge_rulesets';
            referencedColumns: ['version'];
          },
          {
            foreignKeyName: 'daily_runs_gameplay_ruleset_version_fkey';
            columns: ['gameplay_ruleset_version'];
            isOneToOne: false;
            referencedRelation: 'gameplay_rulesets';
            referencedColumns: ['version'];
          },
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
            referencedRelation: 'players';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_runs_run_attempt_id_fkey';
            columns: ['run_attempt_id'];
            isOneToOne: false;
            referencedRelation: 'run_attempts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_runs_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: false;
            referencedRelation: 'runs';
            referencedColumns: ['id'];
          },
        ];
      };
      daily_score_reports: {
        Row: {
          created_at: string;
          daily_run_id: string;
          id: string;
          reason: string;
          reporter_user_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          daily_run_id: string;
          id?: string;
          reason: string;
          reporter_user_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          daily_run_id?: string;
          id?: string;
          reason?: string;
          reporter_user_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'daily_score_reports_daily_run_id_fkey';
            columns: ['daily_run_id'];
            isOneToOne: false;
            referencedRelation: 'daily_runs';
            referencedColumns: ['id'];
          },
        ];
      };
      enhancement_node_catalog: {
        Row: {
          active: boolean;
          candy_cost: number;
          champion_role: string;
          created_at: string;
          max_rank: number;
          node_id: string;
          prerequisite_node_ids: string[];
          required_mastery_level: number;
          ruleset_version: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          candy_cost: number;
          champion_role: string;
          created_at?: string;
          max_rank?: number;
          node_id: string;
          prerequisite_node_ids?: string[];
          required_mastery_level?: number;
          ruleset_version?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          candy_cost?: number;
          champion_role?: string;
          created_at?: string;
          max_rank?: number;
          node_id?: string;
          prerequisite_node_ids?: string[];
          required_mastery_level?: number;
          ruleset_version?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'enhancement_node_catalog_ruleset_version_fkey';
            columns: ['ruleset_version'];
            isOneToOne: false;
            referencedRelation: 'progression_rulesets';
            referencedColumns: ['version'];
          },
        ];
      };
      gameplay_content_catalog: {
        Row: {
          active: boolean;
          content_id: string;
          content_type: string;
          gameplay_ruleset_version: number;
          max_stacks: number;
        };
        Insert: {
          active?: boolean;
          content_id: string;
          content_type: string;
          gameplay_ruleset_version: number;
          max_stacks?: number;
        };
        Update: {
          active?: boolean;
          content_id?: string;
          content_type?: string;
          gameplay_ruleset_version?: number;
          max_stacks?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'gameplay_content_catalog_gameplay_ruleset_version_fkey';
            columns: ['gameplay_ruleset_version'];
            isOneToOne: false;
            referencedRelation: 'gameplay_rulesets';
            referencedColumns: ['version'];
          },
        ];
      };
      gameplay_rulesets: {
        Row: {
          attempt_ttl: string;
          code: string;
          command_schema_version: number;
          content_hash: string;
          created_at: string;
          engine_version: string;
          is_active: boolean;
          max_commands: number;
          version: number;
        };
        Insert: {
          attempt_ttl?: string;
          code: string;
          command_schema_version: number;
          content_hash: string;
          created_at?: string;
          engine_version: string;
          is_active?: boolean;
          max_commands?: number;
          version: number;
        };
        Update: {
          attempt_ttl?: string;
          code?: string;
          command_schema_version?: number;
          content_hash?: string;
          created_at?: string;
          engine_version?: string;
          is_active?: boolean;
          max_commands?: number;
          version?: number;
        };
        Relationships: [];
      };
      leaderboard_seasons: {
        Row: {
          code: string;
          created_at: string;
          ends_at: string;
          is_active: boolean;
          starts_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          ends_at: string;
          is_active?: boolean;
          starts_at: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          ends_at?: string;
          is_active?: boolean;
          starts_at?: string;
        };
        Relationships: [];
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
          leaderboard_opt_out: boolean;
          level: number;
          public_display_name: string | null;
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
          leaderboard_opt_out?: boolean;
          level?: number;
          public_display_name?: string | null;
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
          leaderboard_opt_out?: boolean;
          level?: number;
          public_display_name?: string | null;
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
      progression_champion_catalog: {
        Row: {
          active: boolean;
          champion_id: string;
          created_at: string;
          primary_role: string;
          ruleset_version: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          champion_id: string;
          created_at?: string;
          primary_role: string;
          ruleset_version?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          champion_id?: string;
          created_at?: string;
          primary_role?: string;
          ruleset_version?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'progression_champion_catalog_ruleset_version_fkey';
            columns: ['ruleset_version'];
            isOneToOne: false;
            referencedRelation: 'progression_rulesets';
            referencedColumns: ['version'];
          },
        ];
      };
      progression_commands: {
        Row: {
          command_id: string;
          command_type: string;
          completed_at: string | null;
          created_at: string;
          payload_hash: string;
          response: Json | null;
          ruleset_version: number;
          user_id: string;
        };
        Insert: {
          command_id: string;
          command_type: string;
          completed_at?: string | null;
          created_at?: string;
          payload_hash: string;
          response?: Json | null;
          ruleset_version: number;
          user_id: string;
        };
        Update: {
          command_id?: string;
          command_type?: string;
          completed_at?: string | null;
          created_at?: string;
          payload_hash?: string;
          response?: Json | null;
          ruleset_version?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'progression_commands_ruleset_version_fkey';
            columns: ['ruleset_version'];
            isOneToOne: false;
            referencedRelation: 'progression_rulesets';
            referencedColumns: ['version'];
          },
        ];
      };
      progression_enhancement_security_baselines: {
        Row: {
          baseline_code: string;
          captured_at: string;
          champion_id: string;
          original_unlocked_nodes: Json;
          policy: string;
          retained_verified_nodes: Json;
          user_id: string;
        };
        Insert: {
          baseline_code: string;
          captured_at?: string;
          champion_id: string;
          original_unlocked_nodes: Json;
          policy: string;
          retained_verified_nodes: Json;
          user_id: string;
        };
        Update: {
          baseline_code?: string;
          captured_at?: string;
          champion_id?: string;
          original_unlocked_nodes?: Json;
          policy?: string;
          retained_verified_nodes?: Json;
          user_id?: string;
        };
        Relationships: [];
      };
      progression_rulesets: {
        Row: {
          base_candies: number;
          candies_per_biome: number;
          candies_per_wave: number;
          code: string;
          created_at: string;
          is_active: boolean;
          max_run_level: number;
          max_team_size: number;
          max_waves_by_biome: number[];
          min_victory_waves: number;
          version: number;
          victory_bonus: number;
        };
        Insert: {
          base_candies: number;
          candies_per_biome: number;
          candies_per_wave: number;
          code: string;
          created_at?: string;
          is_active?: boolean;
          max_run_level: number;
          max_team_size: number;
          max_waves_by_biome: number[];
          min_victory_waves: number;
          version: number;
          victory_bonus: number;
        };
        Update: {
          base_candies?: number;
          candies_per_biome?: number;
          candies_per_wave?: number;
          code?: string;
          created_at?: string;
          is_active?: boolean;
          max_run_level?: number;
          max_team_size?: number;
          max_waves_by_biome?: number[];
          min_victory_waves?: number;
          version?: number;
          victory_bonus?: number;
        };
        Relationships: [];
      };
      progression_security_baselines: {
        Row: {
          baseline_code: string;
          created_at: string;
          cutoff_at: string;
          migration_version: string;
          notes: string;
          policy: string;
        };
        Insert: {
          baseline_code: string;
          created_at?: string;
          cutoff_at: string;
          migration_version: string;
          notes: string;
          policy: string;
        };
        Update: {
          baseline_code?: string;
          created_at?: string;
          cutoff_at?: string;
          migration_version?: string;
          notes?: string;
          policy?: string;
        };
        Relationships: [];
      };
      run_attempt_commands: {
        Row: {
          attempt_id: string;
          chain_hash: string;
          command_id: string;
          kind: string;
          payload: Json;
          payload_hash: string;
          previous_hash: string;
          received_at: string;
          sequence: number;
        };
        Insert: {
          attempt_id: string;
          chain_hash: string;
          command_id: string;
          kind: string;
          payload: Json;
          payload_hash: string;
          previous_hash: string;
          received_at?: string;
          sequence: number;
        };
        Update: {
          attempt_id?: string;
          chain_hash?: string;
          command_id?: string;
          kind?: string;
          payload?: Json;
          payload_hash?: string;
          previous_hash?: string;
          received_at?: string;
          sequence?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'run_attempt_commands_attempt_id_fkey';
            columns: ['attempt_id'];
            isOneToOne: false;
            referencedRelation: 'run_attempts';
            referencedColumns: ['id'];
          },
        ];
      };
      run_attempts: {
        Row: {
          command_schema_version: number;
          created_at: string;
          daily_date: string | null;
          daily_official: boolean;
          daily_ruleset_version: number | null;
          daily_score_version: number | null;
          difficulty: string;
          engine_version: string;
          enhancement_snapshot: Json;
          expired_at: string | null;
          expires_at: string;
          finish_command_id: string | null;
          finished_at: string | null;
          gameplay_content_hash: string;
          gameplay_ruleset_version: number;
          id: string;
          initial_team: string[];
          journal_bytes: number;
          journal_hash: string;
          last_sequence: number;
          lease_expires_at: string | null;
          lease_token: string | null;
          lease_worker_id: string | null;
          mastery_snapshot: Json;
          mode: string;
          player_id: string;
          rejected_at: string | null;
          rejection_code: string | null;
          response: Json | null;
          result: Json | null;
          result_hash: string | null;
          result_run_id: string | null;
          ruleset_version: number;
          run_uuid: string;
          rune_ids: string[];
          sealed_journal_hash: string | null;
          sealed_sequence: number | null;
          seed: number;
          start_command_id: string;
          start_payload_hash: string;
          started_at: string;
          status: string;
          updated_at: string;
          user_id: string;
          verification_attempts: number;
          verified_at: string | null;
        };
        Insert: {
          command_schema_version: number;
          created_at?: string;
          daily_date?: string | null;
          daily_official?: boolean;
          daily_ruleset_version?: number | null;
          daily_score_version?: number | null;
          difficulty: string;
          engine_version: string;
          enhancement_snapshot?: Json;
          expired_at?: string | null;
          expires_at: string;
          finish_command_id?: string | null;
          finished_at?: string | null;
          gameplay_content_hash: string;
          gameplay_ruleset_version: number;
          id?: string;
          initial_team: string[];
          journal_bytes?: number;
          journal_hash: string;
          last_sequence?: number;
          lease_expires_at?: string | null;
          lease_token?: string | null;
          lease_worker_id?: string | null;
          mastery_snapshot?: Json;
          mode: string;
          player_id: string;
          rejected_at?: string | null;
          rejection_code?: string | null;
          response?: Json | null;
          result?: Json | null;
          result_hash?: string | null;
          result_run_id?: string | null;
          ruleset_version: number;
          run_uuid: string;
          rune_ids?: string[];
          sealed_journal_hash?: string | null;
          sealed_sequence?: number | null;
          seed: number;
          start_command_id: string;
          start_payload_hash: string;
          started_at?: string;
          status?: string;
          updated_at?: string;
          user_id: string;
          verification_attempts?: number;
          verified_at?: string | null;
        };
        Update: {
          command_schema_version?: number;
          created_at?: string;
          daily_date?: string | null;
          daily_official?: boolean;
          daily_ruleset_version?: number | null;
          daily_score_version?: number | null;
          difficulty?: string;
          engine_version?: string;
          enhancement_snapshot?: Json;
          expired_at?: string | null;
          expires_at?: string;
          finish_command_id?: string | null;
          finished_at?: string | null;
          gameplay_content_hash?: string;
          gameplay_ruleset_version?: number;
          id?: string;
          initial_team?: string[];
          journal_bytes?: number;
          journal_hash?: string;
          last_sequence?: number;
          lease_expires_at?: string | null;
          lease_token?: string | null;
          lease_worker_id?: string | null;
          mastery_snapshot?: Json;
          mode?: string;
          player_id?: string;
          rejected_at?: string | null;
          rejection_code?: string | null;
          response?: Json | null;
          result?: Json | null;
          result_hash?: string | null;
          result_run_id?: string | null;
          ruleset_version?: number;
          run_uuid?: string;
          rune_ids?: string[];
          sealed_journal_hash?: string | null;
          sealed_sequence?: number | null;
          seed?: number;
          start_command_id?: string;
          start_payload_hash?: string;
          started_at?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
          verification_attempts?: number;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'run_attempts_daily_ruleset_fk';
            columns: ['daily_ruleset_version'];
            isOneToOne: false;
            referencedRelation: 'daily_challenge_rulesets';
            referencedColumns: ['version'];
          },
          {
            foreignKeyName: 'run_attempts_gameplay_ruleset_version_fkey';
            columns: ['gameplay_ruleset_version'];
            isOneToOne: false;
            referencedRelation: 'gameplay_rulesets';
            referencedColumns: ['version'];
          },
          {
            foreignKeyName: 'run_attempts_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'admin_player_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'run_attempts_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'run_attempts_result_run_id_fkey';
            columns: ['result_run_id'];
            isOneToOne: true;
            referencedRelation: 'runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'run_attempts_ruleset_version_fkey';
            columns: ['ruleset_version'];
            isOneToOne: false;
            referencedRelation: 'progression_rulesets';
            referencedColumns: ['version'];
          },
        ];
      };
      run_team_members: {
        Row: {
          assists: number;
          champion_id: string;
          created_at: string;
          crowd_control_duration: number;
          cs_score: number;
          damage_dealt: number;
          damage_received: number;
          damage_to_shields: number;
          deaths: number;
          final_hp: number;
          final_level: number;
          gold_earned: number;
          healing_done: number;
          healing_received: number;
          id: string;
          items_collected: string[];
          kills: number;
          overhealing: number;
          run_id: string;
          shielding_absorbed: number;
          shielding_done: number;
          survived: boolean;
          time_alive_seconds: number;
        };
        Insert: {
          assists?: number;
          champion_id: string;
          created_at?: string;
          crowd_control_duration?: number;
          cs_score?: number;
          damage_dealt?: number;
          damage_received?: number;
          damage_to_shields?: number;
          deaths?: number;
          final_hp?: number;
          final_level?: number;
          gold_earned?: number;
          healing_done?: number;
          healing_received?: number;
          id?: string;
          items_collected?: string[];
          kills?: number;
          overhealing?: number;
          run_id: string;
          shielding_absorbed?: number;
          shielding_done?: number;
          survived?: boolean;
          time_alive_seconds?: number;
        };
        Update: {
          assists?: number;
          champion_id?: string;
          created_at?: string;
          crowd_control_duration?: number;
          cs_score?: number;
          damage_dealt?: number;
          damage_received?: number;
          damage_to_shields?: number;
          deaths?: number;
          final_hp?: number;
          final_level?: number;
          gold_earned?: number;
          healing_done?: number;
          healing_received?: number;
          id?: string;
          items_collected?: string[];
          kills?: number;
          overhealing?: number;
          run_id?: string;
          shielding_absorbed?: number;
          shielding_done?: number;
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
          augment_ids: string[];
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
          gold_balance: number;
          gold_earned: number;
          id: string;
          items_purchased: number;
          ledger_version: number;
          node_types_visited: string[];
          nodes_completed: number;
          player_id: string;
          progression_payload_hash: string | null;
          progression_source: string;
          progression_version: number;
          run_attempt_id: string | null;
          run_ledger: Json;
          run_level: number;
          run_uuid: string;
          rune_ids: string[];
          seed: number | null;
          started_at: string;
          total_assists: number;
          total_damage_dealt: number;
          total_damage_received: number;
          total_damage_to_shields: number;
          total_gold_spent: number;
          total_healing_done: number;
          total_healing_received: number;
          total_kills: number;
          total_overhealing: number;
          total_shielding_absorbed: number;
          total_shielding_done: number;
          waves_completed: number;
          won: boolean;
        };
        Insert: {
          augment_ids?: string[];
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
          gold_balance?: number;
          gold_earned?: number;
          id?: string;
          items_purchased?: number;
          ledger_version?: number;
          node_types_visited?: string[];
          nodes_completed?: number;
          player_id: string;
          progression_payload_hash?: string | null;
          progression_source?: string;
          progression_version?: number;
          run_attempt_id?: string | null;
          run_ledger?: Json;
          run_level?: number;
          run_uuid: string;
          rune_ids?: string[];
          seed?: number | null;
          started_at?: string;
          total_assists?: number;
          total_damage_dealt?: number;
          total_damage_received?: number;
          total_damage_to_shields?: number;
          total_gold_spent?: number;
          total_healing_done?: number;
          total_healing_received?: number;
          total_kills?: number;
          total_overhealing?: number;
          total_shielding_absorbed?: number;
          total_shielding_done?: number;
          waves_completed?: number;
          won?: boolean;
        };
        Update: {
          augment_ids?: string[];
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
          gold_balance?: number;
          gold_earned?: number;
          id?: string;
          items_purchased?: number;
          ledger_version?: number;
          node_types_visited?: string[];
          nodes_completed?: number;
          player_id?: string;
          progression_payload_hash?: string | null;
          progression_source?: string;
          progression_version?: number;
          run_attempt_id?: string | null;
          run_ledger?: Json;
          run_level?: number;
          run_uuid?: string;
          rune_ids?: string[];
          seed?: number | null;
          started_at?: string;
          total_assists?: number;
          total_damage_dealt?: number;
          total_damage_received?: number;
          total_damage_to_shields?: number;
          total_gold_spent?: number;
          total_healing_done?: number;
          total_healing_received?: number;
          total_kills?: number;
          total_overhealing?: number;
          total_shielding_absorbed?: number;
          total_shielding_done?: number;
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
            referencedRelation: 'players';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'runs_run_attempt_id_fkey';
            columns: ['run_attempt_id'];
            isOneToOne: true;
            referencedRelation: 'run_attempts';
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
      daily_leaderboard: {
        Row: {
          daily_date: string | null;
          daily_ruleset_version: number | null;
          entry_id: string | null;
          gameplay_ruleset_version: number | null;
          player_name: string | null;
          rank: number | null;
          run_level_reached: number | null;
          score: number | null;
          score_version: number | null;
          season_code: string | null;
          waves_completed: number | null;
          won: boolean | null;
        };
        Relationships: [];
      };
      leaderboard: {
        Row: {
          avatar_url: string | null;
          level: number | null;
          player_name: string | null;
          rank: number | null;
          total_runs_completed: number | null;
          total_waves_completed: number | null;
          total_wins: number | null;
          win_rate: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      append_run_attempt_commands: {
        Args: { p_attempt_id: string; p_commands: Json };
        Returns: Json;
      };
      claim_run_verification: {
        Args: { p_attempt_id: string; p_worker_id: string };
        Returns: Json;
      };
      claim_run_verification_v7: {
        Args: { p_attempt_id: string; p_worker_id: string };
        Returns: Json;
      };
      complete_run_verification: {
        Args: {
          p_attempt_id: string;
          p_lease_token: string;
          p_result: Json;
          p_result_hash: string;
        };
        Returns: Json;
      };
      complete_run_verification_v1: {
        Args: {
          p_attempt_id: string;
          p_lease_token: string;
          p_result: Json;
          p_result_hash: string;
        };
        Returns: Json;
      };
      complete_run_verification_v10_contract: {
        Args: {
          p_attempt_id: string;
          p_lease_token: string;
          p_result: Json;
          p_result_hash: string;
        };
        Returns: Json;
      };
      complete_run_verification_v11_contract: {
        Args: {
          p_attempt_id: string;
          p_lease_token: string;
          p_result: Json;
          p_result_hash: string;
        };
        Returns: Json;
      };
      complete_run_verification_v12_contract: {
        Args: {
          p_attempt_id: string;
          p_lease_token: string;
          p_result: Json;
          p_result_hash: string;
        };
        Returns: Json;
      };
      complete_run_verification_v6: {
        Args: {
          p_attempt_id: string;
          p_lease_token: string;
          p_result: Json;
          p_result_hash: string;
        };
        Returns: Json;
      };
      complete_run_verification_v7_contract: {
        Args: {
          p_attempt_id: string;
          p_lease_token: string;
          p_result: Json;
          p_result_hash: string;
        };
        Returns: Json;
      };
      complete_run_verification_v8_contract: {
        Args: {
          p_attempt_id: string;
          p_lease_token: string;
          p_result: Json;
          p_result_hash: string;
        };
        Returns: Json;
      };
      complete_run_verification_v9_contract: {
        Args: {
          p_attempt_id: string;
          p_lease_token: string;
          p_result: Json;
          p_result_hash: string;
        };
        Returns: Json;
      };
      daily_seed_for_date: {
        Args: { p_daily_date: string; p_seed_namespace: string };
        Returns: number;
      };
      daily_starter_ids: {
        Args: { p_daily_date: string; p_ruleset_version: number };
        Returns: string[];
      };
      daily_utc_date: { Args: { p_instant: string }; Returns: string };
      daily_utc_expiration: { Args: { p_daily_date: string }; Returns: string };
      expire_stale_run_attempts: { Args: never; Returns: Json };
      get_daily_challenge: { Args: never; Returns: Json };
      get_my_leaderboard_rank: { Args: never; Returns: number };
      get_run_attempt_status: { Args: { p_attempt_id: string }; Returns: Json };
      invalidate_daily_score: {
        Args: { p_daily_run_id: string; p_reason: string };
        Returns: undefined;
      };
      is_current_user_admin: { Args: never; Returns: boolean };
      mastery_current_level_candies: {
        Args: { p_candies: number };
        Returns: number;
      };
      mastery_level_from_candies: {
        Args: { p_candies: number };
        Returns: number;
      };
      mastery_unlock_ids: { Args: { p_candies: number }; Returns: string[] };
      progression_integer: {
        Args: {
          p_default: number;
          p_field_name: string;
          p_maximum: number;
          p_minimum: number;
          p_value: Json;
        };
        Returns: number;
      };
      purge_expired_logs: { Args: never; Returns: number };
      purge_expired_social_data: { Args: never; Returns: number };
      reject_run_verification: {
        Args: {
          p_attempt_id: string;
          p_lease_token: string;
          p_rejection_code: string;
        };
        Returns: Json;
      };
      report_daily_score: {
        Args: { p_daily_run_id: string; p_reason: string };
        Returns: undefined;
      };
      sanitize_log_jsonb: {
        Args: { p_depth?: number; p_value: Json };
        Returns: Json;
      };
      sanitize_log_text: {
        Args: { p_max_length: number; p_value: string };
        Returns: string;
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
      save_completed_run_integer_payload: {
        Args: {
          p_mastery: Json;
          p_run: Json;
          p_team_members: Json;
          p_total_candies: number;
        };
        Returns: string;
      };
      save_completed_run_v2: {
        Args: {
          p_augment_ids: string[];
          p_run: Json;
          p_rune_ids: string[];
          p_team_members: Json;
        };
        Returns: Json;
      };
      seal_run_attempt: {
        Args: {
          p_attempt_id: string;
          p_expected_sequence: number;
          p_finish_command_id: string;
        };
        Returns: Json;
      };
      set_leaderboard_privacy: {
        Args: { p_opt_out: boolean; p_public_display_name: string };
        Returns: undefined;
      };
      start_daily_run_attempt: {
        Args: { p_command_id: string; p_rune_ids: string[]; p_team: string[] };
        Returns: Json;
      };
      start_daily_run_attempt_v7: {
        Args: { p_command_id: string; p_rune_ids: string[]; p_team: string[] };
        Returns: Json;
      };
      start_run_attempt: {
        Args: {
          p_command_id: string;
          p_difficulty: string;
          p_mode?: string;
          p_rune_ids: string[];
          p_team: string[];
        };
        Returns: Json;
      };
      start_run_attempt_v7: {
        Args: {
          p_command_id: string;
          p_difficulty: string;
          p_mode?: string;
          p_rune_ids: string[];
          p_team: string[];
        };
        Returns: Json;
      };
      submit_client_logs: { Args: { p_logs: Json }; Returns: number };
      touch_player_last_login: { Args: never; Returns: string };
      unlock_champion_enhancement:
        | {
            Args: {
              p_candy_cost: number;
              p_champion_id: string;
              p_max_rank: number;
              p_node_id: string;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_champion_id: string;
              p_command_id: string;
              p_expected_rank: number;
              p_node_id: string;
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
