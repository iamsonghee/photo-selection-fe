export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProjectStatusDb =
  | "preparing"
  | "selecting"
  | "confirmed"
  | "editing"
  | "reviewing_v1"
  | "editing_v2"
  | "reviewing_v2"
  | "delivered";
export type ColorTagDb = "red" | "yellow" | "green" | "blue" | "purple";
export type VersionReviewStatusDb = "approved" | "revision_requested";

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string;
          name: string;
          customer_name: string;
          shoot_date: string;
          deadline: string;
          required_count: number;
          photo_count: number;
          status: ProjectStatusDb;
          photographer_id: string;
          access_token: string;
          confirmed_at: string | null;
          delivered_at: string | null;
          created_at: string;
          updated_at: string;
          access_pin: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          customer_name: string;
          shoot_date: string;
          deadline: string;
          required_count: number;
          photo_count?: number;
          status?: ProjectStatusDb;
          photographer_id: string;
          access_token: string;
          confirmed_at?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
          access_pin?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          customer_name?: string;
          shoot_date?: string;
          deadline?: string;
          required_count?: number;
          photo_count?: number;
          status?: ProjectStatusDb;
          photographer_id?: string;
          access_token?: string;
          confirmed_at?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
          access_pin?: string | null;
        };
      };
      pin_attempts: {
        Row: {
          id: string;
          project_token: string;
          attempted_at: string;
          ip_address: string | null;
        };
        Insert: {
          id?: string;
          project_token: string;
          attempted_at?: string;
          ip_address?: string | null;
        };
        Update: {
          id?: string;
          project_token?: string;
          attempted_at?: string;
          ip_address?: string | null;
        };
      };
      photos: {
        Row: {
          id: string;
          project_id: string;
          number: number;
          r2_thumb_url: string;
          r2_preview_url: string | null;
          original_filename: string | null;
          memo: string | null;
          file_size: number | null;
          r2_original_url: string | null;
          original_ready_at: string | null;
          original_status: 'awaiting_upload' | 'pending' | 'processing' | 'completed' | 'failed' | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          number: number;
          r2_thumb_url: string;
          r2_preview_url?: string | null;
          original_filename?: string | null;
          memo?: string | null;
          file_size?: number | null;
          r2_original_url?: string | null;
          original_ready_at?: string | null;
          original_status?: 'awaiting_upload' | 'pending' | 'processing' | 'completed' | 'failed' | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          number?: number;
          r2_thumb_url?: string;
          r2_preview_url?: string | null;
          original_filename?: string | null;
          memo?: string | null;
          file_size?: number | null;
          r2_original_url?: string | null;
          original_ready_at?: string | null;
          original_status?: 'awaiting_upload' | 'pending' | 'processing' | 'completed' | 'failed' | null;
          created_at?: string;
        };
      };
      selections: {
        Row: {
          id: string;
          project_id: string;
          photo_id: string;
          rating: number | null;
          color_tag: ColorTagDb | null;
          comment: string | null;
          is_selected: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          photo_id: string;
          rating?: number | null;
          color_tag?: ColorTagDb | null;
          comment?: string | null;
          is_selected?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          photo_id?: string;
          rating?: number | null;
          color_tag?: ColorTagDb | null;
          comment?: string | null;
          is_selected?: boolean;
          created_at?: string;
        };
      };
      project_logs: {
        Row: {
          id: string;
          project_id: string;
          photographer_id: string;
          action:
            | "created"
            | "uploaded"
            | "selecting"
            | "confirmed"
            | "editing"
            | "reviewing_v1"
            | "editing_v2"
            | "reviewing_v2"
            | "delivered";
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          photographer_id: string;
          action:
            | "created"
            | "uploaded"
            | "selecting"
            | "confirmed"
            | "editing"
            | "reviewing_v1"
            | "editing_v2"
            | "reviewing_v2"
            | "delivered";
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          photographer_id?: string;
          action?: "created" | "uploaded" | "selecting" | "confirmed" | "editing";
          created_at?: string;
        };
      };
      photographers: {
        Row: {
          id: string;
          auth_id: string;
          email: string | null;
          name: string | null;
          profile_image_url: string | null;
          bio: string | null;
          instagram_url: string | null;
          portfolio_url: string | null;
          created_at: string;
          beta_status: "not_invited" | "active" | "ended" | "suspended";
          beta_start_date: string | null;
          beta_end_date: string | null;
          admin_note: string | null;
          total_projects_created: number;
        };
        Insert: {
          id?: string;
          auth_id: string;
          email?: string | null;
          name?: string | null;
          profile_image_url?: string | null;
          bio?: string | null;
          instagram_url?: string | null;
          portfolio_url?: string | null;
          created_at?: string;
          beta_status?: "not_invited" | "active" | "ended" | "suspended";
          beta_start_date?: string | null;
          beta_end_date?: string | null;
          admin_note?: string | null;
          total_projects_created?: number;
        };
        Update: {
          id?: string;
          auth_id?: string;
          email?: string | null;
          name?: string | null;
          profile_image_url?: string | null;
          bio?: string | null;
          instagram_url?: string | null;
          portfolio_url?: string | null;
          created_at?: string;
          beta_status?: "not_invited" | "active" | "ended" | "suspended";
          beta_start_date?: string | null;
          beta_end_date?: string | null;
          admin_note?: string | null;
          total_projects_created?: number;
        };
      };
      beta_invitations: {
        Row: {
          id: string;
          email: string;
          invited_at: string;
          consumed_at: string | null;
          admin_note: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          invited_at?: string;
          consumed_at?: string | null;
          admin_note?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          invited_at?: string;
          consumed_at?: string | null;
          admin_note?: string | null;
        };
      };
      beta_applications: {
        Row: {
          id: string;
          name: string;
          phone: string;
          email: string | null;
          genre: string;
          monthly_shoot_count: number;
          avg_photos_per_project: number;
          current_workflow: string;
          reason: string;
          privacy_consent_at: string;
          contact_consent_at: string;
          status: "applied" | "reviewing" | "on_hold" | "approved" | "rejected";
          admin_note: string | null;
          contacted: boolean;
          matched_photographer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone: string;
          email?: string | null;
          genre: string;
          monthly_shoot_count: number;
          avg_photos_per_project: number;
          current_workflow: string;
          reason: string;
          privacy_consent_at: string;
          contact_consent_at: string;
          status?: "applied" | "reviewing" | "on_hold" | "approved" | "rejected";
          admin_note?: string | null;
          contacted?: boolean;
          matched_photographer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string;
          email?: string | null;
          genre?: string;
          monthly_shoot_count?: number;
          avg_photos_per_project?: number;
          current_workflow?: string;
          reason?: string;
          privacy_consent_at?: string;
          contact_consent_at?: string;
          status?: "applied" | "reviewing" | "on_hold" | "approved" | "rejected";
          admin_note?: string | null;
          contacted?: boolean;
          matched_photographer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      beta_usage_events: {
        Row: {
          id: string;
          photographer_id: string | null;
          project_id: string | null;
          event_type: "signup_completed" | "first_login" | "customer_link_visited";
          occurred_at: string;
          meta: Record<string, unknown> | null;
        };
        Insert: {
          id?: string;
          photographer_id?: string | null;
          project_id?: string | null;
          event_type: "signup_completed" | "first_login" | "customer_link_visited";
          occurred_at?: string;
          meta?: Record<string, unknown> | null;
        };
        Update: {
          id?: string;
          photographer_id?: string | null;
          project_id?: string | null;
          event_type?: "signup_completed" | "first_login" | "customer_link_visited";
          occurred_at?: string;
          meta?: Record<string, unknown> | null;
        };
      };
      admin_audit_logs: {
        Row: {
          id: string;
          photographer_id: string;
          actor: "admin" | "system";
          action:
            | "beta_granted"
            | "beta_ended"
            | "beta_suspended"
            | "beta_period_changed"
            | "project_limit_hit"
            | "photo_limit_hit";
          detail: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          photographer_id: string;
          actor: "admin" | "system";
          action:
            | "beta_granted"
            | "beta_ended"
            | "beta_suspended"
            | "beta_period_changed"
            | "project_limit_hit"
            | "photo_limit_hit";
          detail?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          photographer_id?: string;
          actor?: "admin" | "system";
          action?:
            | "beta_granted"
            | "beta_ended"
            | "beta_suspended"
            | "beta_period_changed"
            | "project_limit_hit"
            | "photo_limit_hit";
          detail?: Record<string, unknown> | null;
          created_at?: string;
        };
      };
      app_settings: {
        Row: {
          id: number;
          general_max_projects: number;
          general_max_photos_per_project: number;
          beta_max_projects_total: number;
          beta_max_photos_per_project: number;
          beta_max_revision_count: number;
          beta_default_duration_days: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: number;
          general_max_projects?: number;
          general_max_photos_per_project?: number;
          beta_max_projects_total?: number;
          beta_max_photos_per_project?: number;
          beta_max_revision_count?: number;
          beta_default_duration_days?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: number;
          general_max_projects?: number;
          general_max_photos_per_project?: number;
          beta_max_projects_total?: number;
          beta_max_photos_per_project?: number;
          beta_max_revision_count?: number;
          beta_default_duration_days?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
      };
      feedback: {
        Row: {
          id: string;
          reporter_type: "photographer" | "customer";
          photographer_id: string | null;
          project_id: string | null;
          category: "bug" | "suggestion";
          message: string;
          page_url: string | null;
          status: "new" | "reviewing" | "resolved";
          created_at: string;
        };
        Insert: {
          id?: string;
          reporter_type: "photographer" | "customer";
          photographer_id?: string | null;
          project_id?: string | null;
          category: "bug" | "suggestion";
          message: string;
          page_url?: string | null;
          status?: "new" | "reviewing" | "resolved";
          created_at?: string;
        };
        Update: {
          id?: string;
          reporter_type?: "photographer" | "customer";
          photographer_id?: string | null;
          project_id?: string | null;
          category?: "bug" | "suggestion";
          message?: string;
          page_url?: string | null;
          status?: "new" | "reviewing" | "resolved";
          created_at?: string;
        };
      };
      photo_versions: {
        Row: {
          id: string;
          photo_id: string;
          version: number;
          r2_url: string;
          r2_thumb_url: string | null;
          filename: string | null;
          photographer_memo: string | null;
          file_size: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          photo_id: string;
          version: number;
          r2_url: string;
          r2_thumb_url?: string | null;
          filename?: string | null;
          photographer_memo?: string | null;
          file_size?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          photo_id?: string;
          version?: number;
          r2_url?: string;
          r2_thumb_url?: string | null;
          filename?: string | null;
          photographer_memo?: string | null;
          file_size?: number | null;
          created_at?: string;
        };
      };
      version_reviews: {
        Row: {
          id: string;
          photo_version_id: string;
          photo_id: string;
          status: VersionReviewStatusDb;
          customer_comment: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          photo_version_id: string;
          photo_id: string;
          status: VersionReviewStatusDb;
          customer_comment?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          photo_version_id?: string;
          photo_id?: string;
          status?: VersionReviewStatusDb;
          customer_comment?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
      };
    };
  };
}
