export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProjectStatusDb = "preparing" | "selecting" | "confirmed" | "editing";
export type ColorTagDb = "red" | "yellow" | "green" | "blue" | "purple";

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
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          number: number;
          r2_thumb_url: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          number?: number;
          r2_thumb_url?: string;
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
    };
  };
}
