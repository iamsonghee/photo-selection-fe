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
        };
      };
      photos: {
        Row: {
          id: string;
          project_id: string;
          number: number;
          r2_thumb_url: string;
          original_filename: string | null;
          memo: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          number: number;
          r2_thumb_url: string;
          original_filename?: string | null;
          memo?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          number?: number;
          r2_thumb_url?: string;
          original_filename?: string | null;
          memo?: string | null;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          photo_id: string;
          rating?: number | null;
          color_tag?: ColorTagDb | null;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          photo_id?: string;
          rating?: number | null;
          color_tag?: ColorTagDb | null;
          comment?: string | null;
          created_at?: string;
        };
      };
      project_logs: {
        Row: {
          id: string;
          project_id: string;
          photographer_id: string;
          action: "created" | "uploaded" | "selecting" | "confirmed" | "editing";
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          photographer_id: string;
          action: "created" | "uploaded" | "selecting" | "confirmed" | "editing";
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
        };
      };
      photo_versions: {
        Row: {
          id: string;
          photo_id: string;
          version: number;
          r2_url: string;
          photographer_memo: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          photo_id: string;
          version: number;
          r2_url: string;
          photographer_memo?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          photo_id?: string;
          version?: number;
          r2_url?: string;
          photographer_memo?: string | null;
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
