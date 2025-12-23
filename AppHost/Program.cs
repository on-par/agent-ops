var builder = DistributedApplication.CreateBuilder(args);

// Backend: Node.js Fastify server
var backend = builder.AddNpmApp("backend", "../backend", "dev")
    .WithHttpEndpoint(port: 3001, env: "PORT")
    .WithExternalHttpEndpoints();

// Frontend: Vite React app
var frontend = builder.AddNpmApp("frontend", "../frontend", "dev")
    .WithHttpEndpoint(port: 5173, env: "PORT")
    .WithExternalHttpEndpoints()
    .WithEnvironment("VITE_API_URL", backend.GetEndpoint("http"))
    .WithReference(backend);

builder.Build().Run();
