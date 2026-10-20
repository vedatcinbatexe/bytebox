using Execution.Data;
using Execution.Grpc;
using Execution.Messaging;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.EntityFrameworkCore;
using RabbitMQ.Client;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.ListenAnyIP(8080, listen => listen.Protocols = HttpProtocols.Http1); // /health
    kestrel.ListenAnyIP(8081, listen => listen.Protocols = HttpProtocols.Http2); // gRPC
});

builder.Services.AddDbContext<ExecutionDb>(options => options.UseNpgsql(config.GetConnectionString("Postgres")));
builder.Services.AddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(config.GetConnectionString("Redis")!));
builder.Services.AddSingleton(_ =>
    new ConnectionFactory { Uri = new Uri(config["RabbitMq:Url"]!) }.CreateConnectionAsync().GetAwaiter().GetResult());
builder.Services.AddSingleton<RunQueue>();
builder.Services.AddHostedService<RunResultConsumer>();
builder.Services.AddHostedService<LiveOutputConsumer>();
builder.Services.AddGrpc();
builder.Services.AddGrpcReflection();

var app = builder.Build();

// Apply EF Core migrations (Migrations/) on startup
using (var scope = app.Services.CreateScope())
{
    await scope.ServiceProvider.GetRequiredService<ExecutionDb>().Database.MigrateAsync();
}

app.MapGrpcService<ExecutionGrpcService>();
app.MapGrpcReflectionService();
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "execution" }));

app.Run();
