# Pulse

## Overview
Pulse is an application used by software developers, test/quality engineers, and product specialists to test event driven applications.

It is similar to Postman - an API development platform, used to test and monitor API's via a user-friendly graphical interface. It allows users to store event schemas, generate new events (including randomly generated values), and send them to the target application.

The app is used in the context of "target systems" - similar to a Postman Workspace. A system can have multiple schemas, listeners, environments, profiles, and templates (more on these below).

Target systems may be deployed to multiple environments, and as such, like Postman, users can configure environments in pulse.

Event driven systems don't just receive events, they also produce downstream outputs, and/or have side effects (i.e. database entries/modifications). As such, users can use Pulse to monitor these outputs and side effects.

Listeners can be configured with filters, so the listener streams only record data that is relevant to the current context (i.e. the input event that was just sent).

Users can configure and save schemas - a definition used to generate an event. Elements of the schema are defined with a data-type. Datatypes include both default types, as well as custom types (configured by the user). Datatypes have a generation strategy(ies) configured with them to define random generation of that value. Schema elements are also marked as required/optional.

When users want to send an event, they can specify specific attribute values for the event, and the schema will randomly generate the remaining values.

Additionally, users can configure Profiles. Profiles contain specific schema element overrides. Users can apply multiple profiles at any given time, allowing for these modifications to stack. Profiles are applied in order, meaning multiple profiles can manipulate the same schema element.

Users can create templates, stored and viewed in a folder structure for the target system. Templates are a set of default fields, with a preset destination, and (optionally) some profiles readily applied. Templates are required to have any required fields set (or marked as purposefully ommitted), and the user can generate and send a message with a single button click.

### Sessions

A user creates a session to begin sending events to the target system. Listeners can be configured to filter received events based on the context of the session - i.e. the id(s) of event(s) sent in that session. Session events, both events sent to the target system and (filtered) events received from the target system, are saved so they can be reviewed as necessary in the future. Any logs related to the session are also stored.

The number of historical saved sessions is configurable (default is 10).

## User Interface

The UI has configurable, collpasable, panels on the left and bottom of the UI. The main content uses tabs, similar to Postman. The bottom collapsable panel contains a console (used to display logs) widget. The bottom panel can also contain a listener widget (used to listen to system outputs/side effects). The right collapsable panel contains widgets for listeners.

A dropdown tab at the top right of the app allows users to select the environment. Another dropdown allows users to optionally select a profile (more on Profiles later).

On the bottom right of the system bar, users can select the Cloud Profile (i.e. AWS profile). Profiles are auto-loaded for users to select from, given the system configuration.

## Supported Integrations

### Inputs

Configured target systems support the following inputs:
- AWS Kinesis
- AWS SQS
- AWS Event Bridge

In the future, other cloud platforms will be supported (i.e. Azure, GCP)

### Ouputs / Listeners

Configured target systems support the following outputs/listeners:
- AWS Kinesis
- AWS SQS

In the future, other cloud platforms will be supported (i.e. Azure, GCP)

## AWS

AWS is currently the only supported cloud platform, althougth others may be supported in the future.

The application will automatically attempt to identify AWS profiles configured on the system, via ~/.aws/ directory, environment variables, and IAM roles.

The application uses the AWS SDK v3 for Javascript.

## Example Use Cases

### Kinesis in, Kinesis out
A system receives events via AWS Kinesis. The system saves the event to a DynamoDB table, and performs some operations. As a result, several output messages are sent to an output kinesis stream.

Users want to generate and send an event to the input kinesis stream, and listen to the output stream to watch for output messages.

Users will want to filter the received output messages, to only show the messages that relate to the input message.

### Profile modification for Test Cases

A user wants to use profiles to specify certain test case scenarios. They override certain schema elements to trigger certain situations. The user then toggles those profiles on/off as they send events to test those situations.

### Historical Review
A user wants to go back and review previous messages sent, and related messages received, up to a configurable number of historical messages, for a given system.

### Message Templates
A user wants to store message templates, in a folder heirarchy, for a system. A user can quickly select, generate, and send messages to the system from these templates.

## Developer Information
### Tech Stack

This project uses ElectronJS + VueJS and Typescript. It is built with vite.

State is managed via Pinia, and data is persisted as json files.

This application is primilarly built for MacOS, but is intended to be available for Windows and Linux as well.

### Testing

This project contains comprehensive testing, including unit tests, component tests (UI), and end-to-end tests.

This project uses vitest for unit tests and ui tests, and uses playwright for end-to-end tests.

### Tech Notes 

- Schemas are stored as json and follow the OpenAPI spec. For now, Schema versioning is not supported. Events generated are validated, but schema validation only produces warnings, as some events are sent malformed on purpose (i.e. negative testing scenarios)
- Profiles are stacked, applied in order, and use last write wins. It will be the users responsibility to ensure that the profiles don't conflict in an unintentional way.
- Profiles are scoped to a target system, same as environments.
- Target systems can have multiple configured inputs, and multiple configured outputs.
- Variable replacement from environments can be used in schemas, input/output configuration, profiles, and templates. Replacement is identified by the {{ variable }} pattern.
- The application should log events. These events can be viewed by the user via the console tab on the footer panel (collapsable).
- There is no retry for sending events. Users can retry failures as they desire.
- Listener errors are logged, and the user notified via the UI. Listener configurations can include retry details as necessary.
- For now, Pulse is purely local - no shared workspaces or team sharing (outside of sharing json configuration files)
- Sensitive information (i.e. keys, passwords) should be masked by default. When exporting configurations, sensitive information is omitted. When importing configurations, users will be prompted to enter those omitted details.
