# Spring Boot server projects. The libraries are downloaded here, ahead of time; a project is
# compiled with javac against them, so starting a server needs neither Maven nor the internet.
FROM maven:3.9-eclipse-temurin-21 AS deps
WORKDIR /deps
COPY pom.xml .
RUN mvn -q dependency:copy-dependencies -DincludeScope=runtime -DoutputDirectory=/opt/spring/lib

FROM eclipse-temurin:21-jdk-alpine
COPY --from=deps /opt/spring/lib /opt/spring/lib
RUN chmod -R a+rX /opt/spring
