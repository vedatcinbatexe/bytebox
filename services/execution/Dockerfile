# Build context is the repo root, so the shared proto/ folder is available
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY services/execution/Execution.csproj services/execution/
RUN dotnet restore services/execution/Execution.csproj
COPY proto/ proto/
COPY services/execution/ services/execution/
RUN dotnet publish services/execution/Execution.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
EXPOSE 8080 8081
ENTRYPOINT ["dotnet", "Execution.dll"]
