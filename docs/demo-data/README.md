# Fictional MOVA demo data

[`fictional-mova-ss2-seed.json`](fictional-mova-ss2-seed.json) contains **eight fictional scenarios** for a presentation only. They are not real incidents, are not emergency alerts, and are not loaded by the application.

## Area and schema

Coordinates stay within the documented SS2, Petaling Jaya project area surrounding the application default map centre (3.11806, 101.62083). The dataset uses only existing MOVA payload fields: `type`, `lat`, `lng`, `slope_deg`, `photo_url`, `status`, `severity`, and `created_at`. It deliberately leaves out `id` so a database, if approved, may generate it; it also leaves out `lat_and_lng` because the project does not document its database geometry representation.

`demoPriorityInputs` and `fictionalScenario` are metadata only. In particular, pedestrian traffic and road danger are not MOVA columns and must never be inserted into the shared table.

## Safe presentation use

### Built-in local Demo Mode

After signing in, open **Pitch Views** and choose **View Fictional Demo Data**. The map, priority list, queues, details, and rating then use the eight local scenarios from this file. A persistent **DEMO DATA — NOT REAL REPORTS** notice is shown, and the real report-submission entry point is disabled. Choose **Exit Demo Mode** to clear the fictional records and reload authenticated Supabase data. This mode never calls Supabase for the fictional records.

### Separate staging data

1. Review the JSON and run the dataset validator locally.
2. For a live-looking demo, use an approved **separate staging Supabase project** with the same schema, an approved retention plan, and clearly marked fictional content.
3. Copy only each `movaRecord` object into the staging importer/dashboard after a reviewer approves the insert. Do not copy the wrapper metadata or `demoPriorityInputs`.
4. Do not insert this dataset into `public."MOVA"` until live seeding has received explicit approval. There is intentionally no seed command or automatic loader in this repository.
