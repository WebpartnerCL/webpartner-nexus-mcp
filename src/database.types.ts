// ============================================================================
// database.types.ts — tipos generados desde el esquema VIVO de Supabase.
// NO editar a mano. Regenerar con el MCP de Supabase (generate_typescript_types)
// o con: supabase gen types typescript --project-id banhnvizuzpmlhnchsfn
// Proyecto: webpartner-nexus (banhnvizuzpmlhnchsfn)
// ============================================================================
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
      api_keys: {
        Row: {
          cliente_id: string
          created_at: string
          id: string
          is_service: boolean
          key_hash: string
          label: string | null
          plan: string
          revoked: boolean
        }
        Insert: {
          cliente_id: string
          created_at?: string
          id?: string
          is_service?: boolean
          key_hash: string
          label?: string | null
          plan?: string
          revoked?: boolean
        }
        Update: {
          cliente_id?: string
          created_at?: string
          id?: string
          is_service?: boolean
          key_hash?: string
          label?: string | null
          plan?: string
          revoked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          activo: boolean
          cal_url: string | null
          created_at: string
          google_review_url: string | null
          id: string
          nombre_negocio: string
          plan: string
          politicas_faq: Json
          sitio_contenido: Json
          rubro: string | null
          slug: string
          tono: string
          updated_at: string
          wa_phone_number_id: string | null
        }
        Insert: {
          activo?: boolean
          cal_url?: string | null
          created_at?: string
          google_review_url?: string | null
          id?: string
          nombre_negocio: string
          plan?: string
          politicas_faq?: Json
          sitio_contenido?: Json
          rubro?: string | null
          slug: string
          tono?: string
          updated_at?: string
          wa_phone_number_id?: string | null
        }
        Update: {
          activo?: boolean
          cal_url?: string | null
          created_at?: string
          google_review_url?: string | null
          id?: string
          nombre_negocio?: string
          plan?: string
          politicas_faq?: Json
          sitio_contenido?: Json
          rubro?: string | null
          slug?: string
          tono?: string
          updated_at?: string
          wa_phone_number_id?: string | null
        }
        Relationships: []
      }
      control_resenas: {
        Row: {
          calificacion: number | null
          cliente_id: string
          created_at: string
          enviado_a_google: boolean
          feedback_interno: string | null
          id_lead: string | null
          id_review: string
          token_unico: string
        }
        Insert: {
          calificacion?: number | null
          cliente_id: string
          created_at?: string
          enviado_a_google?: boolean
          feedback_interno?: string | null
          id_lead?: string | null
          id_review?: string
          token_unico: string
        }
        Update: {
          calificacion?: number | null
          cliente_id?: string
          created_at?: string
          enviado_a_google?: boolean
          feedback_interno?: string | null
          id_lead?: string | null
          id_review?: string
          token_unico?: string
        }
        Relationships: [
          {
            foreignKeyName: "control_resenas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "control_resenas_id_lead_fkey"
            columns: ["id_lead"]
            isOneToOne: false
            referencedRelation: "leads_central"
            referencedColumns: ["id_lead"]
          },
          {
            foreignKeyName: "control_resenas_id_lead_fkey"
            columns: ["id_lead"]
            isOneToOne: false
            referencedRelation: "leads_semaforo_v"
            referencedColumns: ["id_lead"]
          },
        ]
      }
      leads_central: {
        Row: {
          cal_event_id: string | null
          cliente_id: string
          created_at: string
          email: string | null
          fase_embudo: string
          fecha_ultima_compra: string | null
          historial_chat_ia: Json
          id_lead: string
          lead_score: number
          necesidad: string | null
          nombre_completo: string | null
          origen: string
          telefono_whatsapp: string | null
          updated_at: string
        }
        Insert: {
          cal_event_id?: string | null
          cliente_id: string
          created_at?: string
          email?: string | null
          fase_embudo?: string
          fecha_ultima_compra?: string | null
          historial_chat_ia?: Json
          id_lead?: string
          lead_score?: number
          necesidad?: string | null
          nombre_completo?: string | null
          origen?: string
          telefono_whatsapp?: string | null
          updated_at?: string
        }
        Update: {
          cal_event_id?: string | null
          cliente_id?: string
          created_at?: string
          email?: string | null
          fase_embudo?: string
          fecha_ultima_compra?: string | null
          historial_chat_ia?: Json
          id_lead?: string
          lead_score?: number
          necesidad?: string | null
          nombre_completo?: string | null
          origen?: string
          telefono_whatsapp?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_central_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotas: {
        Row: {
          limite_mensual: number
          plan: string
          tool: string
        }
        Insert: {
          limite_mensual: number
          plan: string
          tool: string
        }
        Update: {
          limite_mensual?: number
          plan?: string
          tool?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          cliente_id: string
          id: number
          tool: string
          ts: string
          units: number
        }
        Insert: {
          cliente_id: string
          id?: never
          tool: string
          ts?: string
          units?: number
        }
        Update: {
          cliente_id?: string
          id?: never
          tool?: string
          ts?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      leads_semaforo_v: {
        Row: {
          cal_event_id: string | null
          cliente_id: string | null
          created_at: string | null
          email: string | null
          etiqueta_semaforo: string | null
          fase_embudo: string | null
          fecha_ultima_compra: string | null
          historial_chat_ia: Json | null
          id_lead: string | null
          lead_score: number | null
          necesidad: string | null
          nombre_completo: string | null
          origen: string | null
          telefono_whatsapp: string | null
          updated_at: string | null
        }
        Insert: {
          cal_event_id?: string | null
          cliente_id?: string | null
          created_at?: string | null
          email?: string | null
          etiqueta_semaforo?: never
          fase_embudo?: string | null
          fecha_ultima_compra?: string | null
          historial_chat_ia?: Json | null
          id_lead?: string | null
          lead_score?: number | null
          necesidad?: string | null
          nombre_completo?: string | null
          origen?: string | null
          telefono_whatsapp?: string | null
          updated_at?: string | null
        }
        Update: {
          cal_event_id?: string | null
          cliente_id?: string | null
          created_at?: string | null
          email?: string | null
          etiqueta_semaforo?: never
          fase_embudo?: string | null
          fecha_ultima_compra?: string | null
          historial_chat_ia?: Json | null
          id_lead?: string | null
          lead_score?: number | null
          necesidad?: string | null
          nombre_completo?: string | null
          origen?: string | null
          telefono_whatsapp?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_central_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      nexus_semaforo: { Args: { fecha_ultima_compra: string }; Returns: string }
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
