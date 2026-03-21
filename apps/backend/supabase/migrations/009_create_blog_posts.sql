CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  meta_description TEXT NOT NULL DEFAULT '',
  content_markdown TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  target_queries JSONB NOT NULL DEFAULT '[]',
  aeo_patterns JSONB NOT NULL DEFAULT '[]',
  source_urls JSONB NOT NULL DEFAULT '[]',
  source_titles JSONB NOT NULL DEFAULT '[]',
  visual_directives JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blog posts" ON blog_posts
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid())
  );

CREATE UNIQUE INDEX idx_blog_posts_brand_slug ON blog_posts(brand_id, slug);
CREATE INDEX idx_blog_posts_brand ON blog_posts(brand_id);
CREATE INDEX idx_blog_posts_status ON blog_posts(status);
