# ASP.NET Core server projects. ASP.NET is part of the SDK, so a web project needs no downloads.
# A first build here warms up the SDK, which makes the first build of a project faster.
FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine
ENV DOTNET_NOLOGO=1 DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
RUN dotnet new web -o /tmp/warm && dotnet build /tmp/warm -nologo -v q && rm -rf /tmp/warm
