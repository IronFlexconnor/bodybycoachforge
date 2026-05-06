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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          attachments: Json | null
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_checkins: {
        Row: {
          calories: number | null
          checkin_date: string
          created_at: string
          energy: number | null
          id: string
          notes: string | null
          protein_g: number | null
          sleep_hours: number | null
          soreness: number | null
          stress: number | null
          user_id: string
          water_ml: number | null
        }
        Insert: {
          calories?: number | null
          checkin_date?: string
          created_at?: string
          energy?: number | null
          id?: string
          notes?: string | null
          protein_g?: number | null
          sleep_hours?: number | null
          soreness?: number | null
          stress?: number | null
          user_id: string
          water_ml?: number | null
        }
        Update: {
          calories?: number | null
          checkin_date?: string
          created_at?: string
          energy?: number | null
          id?: string
          notes?: string | null
          protein_g?: number | null
          sleep_hours?: number | null
          soreness?: number | null
          stress?: number | null
          user_id?: string
          water_ml?: number | null
        }
        Relationships: []
      }
      exercises: {
        Row: {
          category: string | null
          created_at: string
          equipment: string[] | null
          id: string
          instructions: string | null
          name: string
          primary_muscles: string[] | null
          secondary_muscles: string[] | null
          video_url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          equipment?: string[] | null
          id?: string
          instructions?: string | null
          name: string
          primary_muscles?: string[] | null
          secondary_muscles?: string[] | null
          video_url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          equipment?: string[] | null
          id?: string
          instructions?: string | null
          name?: string
          primary_muscles?: string[] | null
          secondary_muscles?: string[] | null
          video_url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age: number | null
          created_at: string
          days_per_week: number | null
          diet: string | null
          equipment: string[] | null
          gender: string | null
          goal: string | null
          height: number | null
          id: string
          injuries: string | null
          level: string | null
          name: string | null
          onboarded: boolean | null
          session_length: number | null
          timezone: string | null
          units: string | null
          updated_at: string
          user_id: string
          weight: number | null
        }
        Insert: {
          age?: number | null
          created_at?: string
          days_per_week?: number | null
          diet?: string | null
          equipment?: string[] | null
          gender?: string | null
          goal?: string | null
          height?: number | null
          id?: string
          injuries?: string | null
          level?: string | null
          name?: string | null
          onboarded?: boolean | null
          session_length?: number | null
          timezone?: string | null
          units?: string | null
          updated_at?: string
          user_id: string
          weight?: number | null
        }
        Update: {
          age?: number | null
          created_at?: string
          days_per_week?: number | null
          diet?: string | null
          equipment?: string[] | null
          gender?: string | null
          goal?: string | null
          height?: number | null
          id?: string
          injuries?: string | null
          level?: string | null
          name?: string | null
          onboarded?: boolean | null
          session_length?: number | null
          timezone?: string | null
          units?: string | null
          updated_at?: string
          user_id?: string
          weight?: number | null
        }
        Relationships: []
      }
      programs: {
        Row: {
          created_at: string
          current_week: number | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          structure: Json
          style: string | null
          updated_at: string
          user_id: string
          weeks: number | null
        }
        Insert: {
          created_at?: string
          current_week?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          structure?: Json
          style?: string | null
          updated_at?: string
          user_id: string
          weeks?: number | null
        }
        Update: {
          created_at?: string
          current_week?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          structure?: Json
          style?: string | null
          updated_at?: string
          user_id?: string
          weeks?: number | null
        }
        Relationships: []
      }
      progress_metrics: {
        Row: {
          id: string
          meta: Json | null
          metric_type: string
          recorded_at: string
          unit: string | null
          user_id: string
          value: number
        }
        Insert: {
          id?: string
          meta?: Json | null
          metric_type: string
          recorded_at?: string
          unit?: string | null
          user_id: string
          value: number
        }
        Update: {
          id?: string
          meta?: Json | null
          metric_type?: string
          recorded_at?: string
          unit?: string | null
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      set_logs: {
        Row: {
          completed: boolean | null
          created_at: string
          exercise_name: string
          id: string
          notes: string | null
          reps: number | null
          rpe: number | null
          set_number: number
          user_id: string
          weight: number | null
          workout_log_id: string | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          exercise_name: string
          id?: string
          notes?: string | null
          reps?: number | null
          rpe?: number | null
          set_number: number
          user_id: string
          weight?: number | null
          workout_log_id?: string | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          exercise_name?: string
          id?: string
          notes?: string | null
          reps?: number | null
          rpe?: number | null
          set_number?: number
          user_id?: string
          weight?: number | null
          workout_log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "set_logs_workout_log_id_fkey"
            columns: ["workout_log_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      video_uploads: {
        Row: {
          analysis: Json | null
          analyzed_at: string | null
          created_at: string
          cues: string[] | null
          exercise_name: string | null
          id: string
          score: number | null
          status: string | null
          storage_path: string
          user_id: string
        }
        Insert: {
          analysis?: Json | null
          analyzed_at?: string | null
          created_at?: string
          cues?: string[] | null
          exercise_name?: string | null
          id?: string
          score?: number | null
          status?: string | null
          storage_path: string
          user_id: string
        }
        Update: {
          analysis?: Json | null
          analyzed_at?: string | null
          created_at?: string
          cues?: string[] | null
          exercise_name?: string | null
          id?: string
          score?: number | null
          status?: string | null
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_logs: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_min: number | null
          id: string
          notes: string | null
          overall_rpe: number | null
          readiness: number | null
          started_at: string
          user_id: string
          workout_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_min?: number | null
          id?: string
          notes?: string | null
          overall_rpe?: number | null
          readiness?: number | null
          started_at?: string
          user_id: string
          workout_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_min?: number | null
          id?: string
          notes?: string | null
          overall_rpe?: number | null
          readiness?: number | null
          started_at?: string
          user_id?: string
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          created_at: string
          day: number | null
          exercises: Json
          focus: string | null
          id: string
          program_id: string | null
          scheduled_date: string | null
          status: string | null
          title: string
          updated_at: string
          user_id: string
          week: number | null
        }
        Insert: {
          created_at?: string
          day?: number | null
          exercises?: Json
          focus?: string | null
          id?: string
          program_id?: string | null
          scheduled_date?: string | null
          status?: string | null
          title: string
          updated_at?: string
          user_id: string
          week?: number | null
        }
        Update: {
          created_at?: string
          day?: number | null
          exercises?: Json
          focus?: string | null
          id?: string
          program_id?: string | null
          scheduled_date?: string | null
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workouts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
