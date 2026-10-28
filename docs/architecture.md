# QuickNotes System Architecture Design

This document details the system design, capacity planning, component topology, request workflows, and high-availability design for the QuickNotes application.

---

## 1. Requirements

### 1.1. Functional Requirements
- **Create and Manage Notes:** Users can create, view, update, and delete text notes with titles (up to 100 characters) and bodies.
- **List and Search Notes:** Users can retrieve a chronological paginated list of their notes and search by keyword or tag.
- **Asynchronous Task Processing:** Long-running post-write tasks (such as search indexing, notification dispatch, and audit logging) are processed asynchronously in the background.

### 1.2. Non-Functional Requirements
- **High Availability (99.99% uptime):** The system has no single point of failure and remains resilient against regional or node failures.
- **Low Latency:** Read operations (`GET /notes`) return in under 50ms at p95; write operations (`POST /notes`) return in under 100ms at p95.
- **Scalability:** Horizontal scaling across application, caching, and database layers to accommodate growing user traffic and storage demands.
- **Data Durability and Consistency:** Strong consistency for direct note modifications with zero data loss on writes.

---

## 2. Load Estimates (1 Million Daily Active Users)

### Assumptions
- **Daily Active Users (DAU):** 1,000,000 users.
- **Average User Activity:**
  - Reads: 20 read operations per user per day.
  - Writes: 2 new or edited notes per user per day.
- **Note Size:** Average note contains 100 bytes of title + 1,000 bytes of body + 100 bytes of metadata = **~1.2 KB per note**.

### Calculations
1. **Reads Per Second (RPS):**
   - Total reads per day: $1,000,000 \times 20 = 20,000,000 \text{ reads/day}$
   - Seconds per day: $86,400 \approx 86,400 \text{ s}$
   - **Average Read Throughput:** $\frac{20,000,000}{86,400} \approx \mathbf{231 \text{ reads/sec}}$
   - **Peak Read Throughput (3x multiplier):** $\approx \mathbf{693 \text{ reads/sec}}$

2. **Writes Per Second (WPS):**
   - Total writes per day: $1,000,000 \times 2 = 2,000,000 \text{ writes/day}$
   - **Average Write Throughput:** $\frac{2,000,000}{86,400} \approx \mathbf{23 \text{ writes/sec}}$
   - **Peak Write Throughput (3x multiplier):** $\approx \mathbf{69 \text{ writes/sec}}$

3. **Storage Required Per Year:**
   - Notes per day: $2,000,000$
   - Daily storage footprint: $2,000,000 \times 1.2 \text{ KB} = 2.4 \text{ GB/day}$
   - Yearly raw storage: $2.4 \text{ GB/day} \times 365 = \mathbf{876 \text{ GB/year}}$
   - Including indexes, replication (factor of 2), and backups: $\approx \mathbf{2.1 \text{ TB/year}}$

---

## 3. Architecture Diagram

```mermaid
flowchart TD
    Client["Client (Browser / Mobile)"]
    DNS["DNS (e.g., Route 53)"]
    CDN["CDN (Edge Cache for Static Assets)"]
    LB["Load Balancer (ALB / NGINX)"]

    subgraph AppCluster["Application Tier"]
        App1["App Server 1"]
        App2["App Server 2"]
        AppN["App Server N"]
    end

    subgraph CacheTier["Distributed Cache"]
        Cache["Redis / Memcached Cluster"]
    end

    subgraph DBTier["Database Tier"]
        PrimaryDB[("Primary Database (PostgreSQL - Write)")]
        ReplicaDB[("Read Replica (PostgreSQL - Read)")]
    end

    subgraph AsyncTier["Asynchronous Processing"]
        Queue["Message Queue (RabbitMQ / SQS)"]
        Worker["Background Worker Service"]
        SearchIdx[("Search Index / ElasticSearch")]
    end

    Client -->|1. Resolve domain| DNS
    DNS -->|IP address| Client
    Client -->|2. Fetch static assets (HTML/CSS/JS)| CDN
    Client -->|3. API Requests| LB
    LB -->|Round Robin / Least Conn| App1
    LB -->|Round Robin / Least Conn| App2
    LB -->|Round Robin / Least Conn| AppN

    AppCluster <-->|Fast read/invalidation| Cache
    AppCluster -->|Reads on cache miss| ReplicaDB
    AppCluster -->|Writes / Updates| PrimaryDB
    PrimaryDB -.->|Replication stream| ReplicaDB

    AppCluster -->|Publish async events| Queue
    Queue -->|Consume task| Worker
    Worker -->|Update index / audit| SearchIdx
```

---

## 4. Component Descriptions

- **Client:** The web or mobile interface that executes application logic, validates inputs, and renders user notes.
- **DNS (Domain Name System):** Resolves the domain name to the closest geographical entry point and provides health-checked failover routing.
- **CDN (Content Delivery Network):** Serves cached static frontend assets (HTML, CSS, JS, images) close to the user to decrease page load times and offload app servers.
- **Load Balancer:** Evenly distributes incoming HTTPS API traffic across healthy application servers to prevent bottlenecks and eliminate single node hotspots.
- **App Servers (1, 2, ... N):** Stateless compute instances that authenticate requests, execute business rules, and interface with storage backends.
- **Distributed Cache (Redis):** Stores frequently read user notes in memory to deliver sub-millisecond query responses and reduce read pressure on databases.
- **Primary Database (PostgreSQL):** Serves as the authoritative source of truth that processes all writes, maintains ACID guarantees, and streams changes to read replicas.
- **Read Replica Database:** Offloads read traffic from the primary database to ensure read queries do not degrade write performance.
- **Message Queue:** Buffers asynchronous tasks so write requests can return immediately without waiting for expensive side effects to complete.
- **Worker Service:** Consumes jobs from the queue in the background to execute non-critical operations like full-text search indexing, cache warming, and analytics.

---

## 5. Step-by-Step Request Flows

### 5.1. Flow of `GET /notes`
1. **Request Ingestion:** The client sends an authenticated `GET /api/v1/notes` request via HTTPS through the Load Balancer to an available App Server.
2. **Auth Verification:** The App Server validates the authorization token and extracts the `user_id`.
3. **Cache Lookup:** The App Server queries the Distributed Cache for `user:{id}:notes`.
4. **Cache Hit:** If found in cache, the App Server immediately serializes the cached data and returns `200 OK` to the client.
5. **Cache Miss:**
   - If not found in cache, the App Server queries the **Read Replica Database** for the user's latest notes.
   - The App Server populates the cache with the fetched records alongside a Time-To-Live (TTL).
6. **Response Delivery:** The App Server formats the notes payload and returns a `200 OK` response.

### 5.2. Flow of `POST /notes`
1. **Request Ingestion:** The client submits a `POST /api/v1/notes` request with `{ title, body }` to the Load Balancer, which forwards it to an App Server.
2. **Validation:** The App Server validates that `title` is present (1–100 characters) and payload bounds are respected.
3. **Database Write:** The App Server issues an `INSERT` transaction directly to the **Primary Database**, ensuring ACID durability.
4. **Cache Invalidation:** Upon successful database commit, the App Server invalidates or updates the user's note list in the Distributed Cache.
5. **Queue Job Dispatch:** The App Server pushes a lightweight background event (e.g., `note.created`) into the Message Queue.
6. **Immediate Response:** The App Server responds with `201 Created` and the new note record back to the client.
7. **Async Processing:** In the background, the Worker consumes the queue message to update the full-text search engine index and audit logs.

---

## 6. Architectural Trade-offs & Avoiding Single Points of Failure

### 6.1. Architectural Trade-offs

#### Trade-off 1: Cache-Aside with Eventual Consistency vs. Cache-Through / Distributed Locking
- **Choice Made:** Cache-Aside with eviction upon write and a 1-hour fallback TTL.
- **Benefit:** Simple to implement, avoids heavy distributed write locks, and ensures high read throughput.
- **Downside:** There is a tiny window of eventual consistency where a read replica lagging behind replication could populate stale data into the cache if read immediately after a write.

#### Trade-off 2: Asynchronous Worker Queue vs. Synchronous Inline Indexing
- **Choice Made:** Offloading search indexing and external notifications to a Message Queue and background Workers.
- **Benefit:** Keeps the `POST /notes` response time ultra-low (<50ms) and prevents search index outages from blocking note creations.
- **Downside:** Added architectural complexity (monitoring queues, backpressure handling, and idempotency guarantees) and slight delay before newly created notes appear in full-text search.

---

### 6.2. Avoiding Single Points of Failure (SPOFs)

| Component | Potential SPOF Risk | Mitigation Strategy |
| :--- | :--- | :--- |
| **DNS** | DNS server downtime drops all incoming traffic. | Anycast routing with globally distributed managed DNS provider (e.g., AWS Route 53, Cloudflare) with automated health checking. |
| **Load Balancer** | Single load balancer node failure interrupts ingress. | Active-passive or active-active redundant load balancers configured across multiple availability zones (AZs) with auto-healing. |
| **Application Layer** | App server crash drops active sessions. | Stateless application servers deployed across multiple AZs behind an auto-scaling group that automatically restarts failed instances. |
| **Distributed Cache** | Cache node failure spikes traffic to the database. | Redis Cluster running with Primary-Replica replication and Sentinel/Cluster auto-failover across AZs. |
| **Database Tier** | Primary DB crash halts all writes. | Primary DB with synchronous standby replica in a secondary AZ with automated failover; read replicas distributed for read scaling. |
| **Message Queue** | Queue broker crash causes message loss or write blockage. | Clustered queue topology (e.g., quorum queues in RabbitMQ or AWS SQS with multi-AZ replication) with persistent disk storage. |
