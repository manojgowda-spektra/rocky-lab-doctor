# Getting Started with Real-time Intelligence in a Day

Welcome to your Real-Time Analytics workshop! Today, you'll dive into setting up a real-time data pipeline, integrating it with analytics engines, and creating live dashboards to gain instant insights from streaming data.
 
## Accessing Your Lab Environment
 
Once you're ready to begin, your virtual machine and lab guide will be right at your fingertips within your web browser.

   ![](../media/Lab-1---April-2026/Accessyourenv.png)


### Virtual Machine & Lab Guide
 
Your virtual machine is your workhorse throughout the workshop. The lab guide is your roadmap to success.
 
## Exploring Your Lab Resources
 
To better understand your lab resources and credentials, navigate to the **Environment** tab.
 
  ![](../media/Lab-1---April-2026/envtab(1).png)
 
## Utilizing the Split Window Feature
 
For convenience, you can open the lab guide in a separate window by selecting the **Split Window** button from the top right corner.
 
  ![](../media/Lab-1---April-2026/splittab(1).png)
 
## Managing Your Virtual Machine
 
Feel free to start, stop, or restart your virtual machine as needed from the **Resources** tab. Your experience is in your hands!
 
![](../media/Lab-1---April-2026/101.png)

 <br>

# Microsoft Fabric Real-Time Intelligence in a Day - Lab 1

![](../media/Lab-1---April-2026/lb1apr.png)

# Contents

- Document Structure

- Scenario / Problem Statement

- Introduction

- Fabric License

    - Task 1: Enable a Microsoft Fabric trial license

- Real-Time Intelligence and Real-Time Hub

    - Task 2: Real-Time Intelligence Experience Items

    - Task 3: Real-Time Hub

- Create Workspace and Eventhouse

    - Task 4: Create a Fabric Workspace

    - Task 5: Create an Eventhouse

- References

# Document Structure

The lab includes steps for the user to follow along with associated screenshots that provide visual aid. In each screenshot, sections are highlighted with orange boxes to indicate the area(s) user should focus on.

# Scenario / Problem Statement

Fabrikam Inc. is a wholesale novelty goods distributor. The company caters to retail customers globally through its online platform and is planning to enhance its presence in new international markets. Fabrikam just launched a new Rapid Delivery Service pilot in collaboration with its Resellers, allowing customers to receive their purchases within 2 hours in New York city. Fabrikam will be utilizing its fleet of delivery trucks to collect orders from Resellers and deliver them to customers. As an Analytics Engineer you were tasked with providing real-time insights to the operational teams to enable them to fulfill the orders on time and to executives to provide them with the ability to make timely decisions based on current information.

**Current Challenges**

- Develop a robust and scalable architecture to manage continuous streams of real-time data from the e-commerce website and positions of delivery trucks. The e-commerce website generates a stream of orders in an Azure Event Hub. The delivery trucks transmit their latitude and longitude coordinates to an Azure Event Hub using GPS technology.

- Integrate the real-time streaming data with internal data to identify the nearest Reseller with available stock and notify the relevant individuals at the Reseller to prepare the order.

- Combine the two real-time data streams to identify the three closest trucks capable of picking up the order from the reseller and delivering it to the customer. Notify all three delivery trucks that an order has been processed and is ready for pickup. The first available driver is requested to pick up and deliver the order promptly.

- Provide decision-makers with real-time and analytical reports on the performance of the Rapid Delivery Service Pilot.

Fabrikam just adopted Microsoft Fabric as their Unified Data Platform. You have heard that Fabric has Real Time Intelligence out of the box and you’re interested in leveraging Fabric to address the above challenges. You will use Eventhouse, KQL Database and Eventstreams to build a resilient and efficient data processing pipeline.

# Introduction

Today you will learn about various key features of Microsoft Fabric. This is an introductory workshop intended to introduce you to the various product experiences and items available in Fabric. By the end of this workshop, you will learn how to use an Eventhouse, Eventstream, KQL Queryset, Activator and a Real-Time Dashboard. By the end of this lab, you will have learned:

- How to explore Fabric Workloads

- How to create a Fabric workspace

- How to create an Eventhouse

# Fabric License

## Task 1: Enable a Microsoft Fabric trial license

1. Open the **Microsoft Edge** browser on the desktop and paste the below link. You will be navigated to the login page of Microsoft Fabric.

    ```
    https://app.fabric.microsoft.com/
    ```

    >**Note:** If you are not using the lab environment and have an existing Power BI account, you may want to use the browser in private / incognito mode. 
    
    ![](../media/Lab-1---April-2026/image5.png)

2. Enter the **Username** available in the **Environment Variables** tab (next to the Lab Guide) as the **Email** and click **Submit.**

    - **Username/Email:**<inject key="AzureAdUserEmail"></inject> **(1)**

        ![](../media/Lab-1---April-2026/image6.png)

3. You will be navigated to the **Password** screen. Enter the **Password** available in the **Environment Variables** tab (next to the Lab Guide) shared with you by the instructor.

    - **Password:**<inject key="AzureAdUserPassword"></inject> 

4. Click **Sign in** and follow the prompts to sign into Fabric.

    ![](../media/Lab-1---April-2026/main7.png)

5. You will be greeted with a welcome message which gives the option to **Start tour**, which you can opt to do, or you can cancel. Upon cancellation you will be navigated to the **Fabric Home screen**. 

    ![](../media/Lab-1---April-2026/image10.png)

    >**Note:** To work with Fabric items, you will need a license which supports fabric workloads and a workspace that leverages this license. Let’s set this up by acquiring a trial license!

6. On the top right corner of the screen, select the **user** **icon**.

7. Select **Free Trial**.

    ![](../media/Lab-1---April-2026/image11.png)

8. Activate your 60-day free Microsoft Fabric trial dialog opens. Leave the region to the default option and Select **Activate**. We are choosing the default region so that our capacity is in the same region as our tenant, which in turn means it’s in the same region as our OneLake.

    ![](../media/Lab-1---April-2026/image12.png)

9. Successfully upgraded to Microsoft Fabric dialog opens. Select **Got it**.

    ![](../media/Lab-1---April-2026/image13.png)

    >**Note:** If **Invite teammates to try Fabric to extend your trial** pop-up appears close it by clicking on **X**.

    ![](../media/Lab-1---April-2026/INCTM.png)

10. You will be navigated to the **Microsoft** **Fabric Home page**.

    ![](../media/Lab-1---April-2026/image10.png)

# Real-Time Intelligence and Real-Time Hub

In this section, you will explore the Real-Time Intelligence capabilities integrated into Microsoft Fabric. We will focus on navigating the environment rather than creating any items.

## Task 2: Real-Time Intelligence Experience Items

1. If you are not already on the Fabric Home page, select the icon on the bottom left corner of the Power BI service and select fabric

    ![](../media/Lab-1---April-2026/image14.png)

2. From the home screen, scroll in the Learn more about Fabric section and click on the **Build a Real-Time Intelligence solution**.

    ![](../media/Lab-1---April-2026/image15.png)

3. A new web browser tab will open taking you to Microsoft Learn.

4. If you would like to explore the documentation you can but for now navigate back to your browser tab for Microsoft fabric.

5. Select Workloads from the left navigation bar.

    ![](../media/Lab-1---April-2026/image16.png)

    >**Note:** If the **Workloads** is not visible, from the left-navigation pane click on **3 Dots (1)** and select **Workloads (2)**

    ![](../media/Lab-1---April-2026/wrklds.png)

6. From the workloads screen, click on **Real-Time Intelligence** which can be found under **My Workloads**

    ![](../media/Lab-1---April-2026/image17-up.png)

7. You will be navigated to **Real-Time Intelligence Home page**. This page provides samples, tutorials and documentation regarding Real-Time Intelligence.

     1. **Eventhouse:** Used to create a workspace of one or multiple KQL database(s), which can be shared across projects. Also creates a KQL Database within the Eventhouse.

    2. **KQL Queryset:** Used to run queries on the data to produce shareable tables and visuals.

    3. **Real-Time Dashboard**: A collection of tiles, optionally organized in pages, where each tile has an underlying query and a visual representation.

    4. **Eventstream:** Used to capture, transform, and route real-time event stream.

    5. **Activator:** For automatically taking actions when patterns or conditions are detected in changing data.

    6. **Event Schema Set (Preview):** Event schema sets help you organize and standardize data structures (schemas) for your real-time analytics workflows, making it easier to process and analyze streaming data consistently.

    7. **Custom stream connector (preview):** Custom Stream Connector allows you to send real-time events to an eventstream from your own custom endpoints and custom apps.

    8. **Anomaly Detector (Preview):** Anomaly Detector automatically identifies unusual patterns and outliers in your Eventhouse tables.

    9. **Operations agent (Preview):** Instead of relying on manual monitoring, users can track key metrics continuously through the agent and recommend targeted actions. By configuring agents with clear goals, instructions, and data sources, you can deploy multiple agents as virtual experts across your organization.

    10. **Map (Preview):** Unlock geospatial insights with real time data using the Map visual.

    11. **Digital Twin Builder (Preview):** Digital twin builder equips users with low code/no code experiences to build and model their business concepts, such as assets and processes, through an ontology.

        ![](../media/Lab-1---April-2026/image18.png)

## Task 3: Real-Time Hub

1. Click on the **Real-Time** icon within the Fabric navigation pane on the left side of the screen.

    ![](../media/Lab-1---April-2026/image19.png)

    >**Note:** If the **Real-Time** is not visible, from the left-navigation pane click on **3 Dots (1)** and select **Real-Time (2)**

    ![](../media/Lab-1---April-2026/rltm.png)

2. The **Welcome to Real-Time hub** dialogue will open and feel free to select **Take a tour** or select **Get Started**.

    ![](../media/Lab-1---April-2026/image20.png)

3. The Real-Time Hub is the single place for streaming data-in-motion across your entire organization. Every Microsoft Fabric tenant is automatically provisioned with this hub. It enables you to easily discover, ingest, manage, and consume data-in-motion from a wide variety of sources.

4. Within the Real-Time hub you have access to three different types of data integration.

    - **Streaming data:** It is the home page for the Real-Time hub where you can quickly connect data sources and jumpstart samples of data.

    - **Business events (Preview):** It captures something meaningful enough that a downstream workflow should act on it. Business events help drive critical business decisions, automate workflows, trigger alerts, enable analytics, and provide real-time context to artificial intelligence (AI). This capability delivers a unified view of customer-initiated business events in Fabric.

    - **Fabric events:** Events that are generated via Fabric artifacts and external sources, are made available in Fabric to support event-driven scenarios like real-time alerting and triggering downstream actions. You can monitor and react to events including Fabric workspace item events and Azure Blob Storage events.

    - **Azure events:** This list includes system events generated in Azure that you can access. An event can be monitored and rules set that will send notifications or perform actions when activated.

        ![](../media/Lab-1---April-2026/image21.png)

5. On the right side of the Real-Time hub, click on the **+ Add data** button.

    ![](../media/Lab-1---April-2026/image22.png)

6. A screen will appear and will detail the currently available streams of data that are available to integrate into the Real-Time hub. This includes a mixture of Azure sources as well as external cloud streaming sources like Amazon Kinesis, Confluent Cloud Kafka, and Google Cloud Pub/Sub. There is even some sample data available to explore.

    ![](../media/Lab-1---April-2026/image23.png)

# Create Workspace and Eventhouse

## Task 4: Create a Fabric Workspace

1. Now let’s create a workspace with our Fabric license. Select **Workspaces** from the navigation bar on the left.

2.  Select + **New workspace**.

    ![](../media/Lab-1---April-2026/image24.png)

3.  The **Create a workspace** dialog opens on the right side of the browser.

4.  In the **Name** field enter **RTI_ODL_User<inject key="DeploymentID" enableCopy="false"></inject>**. Use the username provided to you from the environment details.

    >**Note:** The workspace name must be unique. Make sure a green check mark with **This name is available** is displayed below the Name field.

5. If you would like, you can enter a **Description** for the workspace. This is an optional field.

6. Click on **Advanced** to expand the section.

    ![](../media/Lab-1---April-2026/image25.png)

7. Under **License mode**, make sure **Trial** is selected. (It should be selected by default if not select it.)

8. Select **Apply** to create a new workspace.

    ![](../media/Lab-1---April-2026/image26.png) 
    
    >**Note:** If the **Introducing task flows** dialog opens, click on **Got it**.
    
    ![](../media/Lab-1---April-2026/image27.png)

## Task 5: Create an Eventhouse

1. Click the **+ New item** box to open a new pane that has all the items you can create in this Fabric workspace.

    ![](../media/Lab-1---April-2026/image28.png)

2.  Select the **Eventhouse** from the **Store data** section within the pane. As we have talked about, this can be viewed similarly to a Lakehouse in that we can store data, but this Eventhouse is focused on real-time streaming data.

    ![](../media/Lab-1---April-2026/image29.png)

3. In the window that appears, give your Eventhouse the name, **eh_Fabrikam** and click on **Create**.

    ![](../media/Lab-1---April-2026/image30.png)

4. This is where you will ultimately stream data from various sources through the rest of the training today. When the item is created, a window will appear giving you some details about the Eventhouse. Click on the **Get started** button.

    ![](../media/Lab-1---April-2026/image31.png)

5. Take a quick tour of the Eventhouse by following the green tooltips on your screen. This first one shows that an empty Kusto Query Language (KQL) Database was created with the Eventhouse.

    ![](../media/Lab-1---April-2026/image32.png)

6. Follow the remainder of the tooltips around the screen to show you where to create additional databases, check the storage in OneLake of the Eventhouse, check the usage of Fabric resources in compute minutes, and finally see what actions have occurred in the Eventhouse.

7. Within the navigational pane on the left of the Eventhouse, find your KQL Database that was created alongside the Eventhouse and simply click on it to view the database details

    ![](../media/Lab-1---April-2026/image33.png)

8. This will allow us to still have one tab at the top of the Fabric portal to see an overview of our entire Eventhouse and a new tab to focus on the KQL Database properties. One goal that we wish to accomplish in our scenario is to ensure that the data streamed to the KQL database is accessible via OneLake. By enabling this feature, we make the data in this KQL Database easily discoverable through shortcuts to be used in any Lakehouse we may want. Locate the **Database details** section on the right and **Enable** the **Availability** option. There will be a pop-up menu that will appear and we will select **Enable**.

    ![](../media/Lab-1---April-2026/image34.png)

    ![](../media/Lab-1---April-2026/image35.png)

9. Return to your **RTI_ODL_User<inject key="DeploymentID" enableCopy="false"></inject>** workspace by selecting it from the left side of the browser, then select it again in the pane that opens

    ![](../media/Lab-1---April-2026/image36.png)

10. If you see the **Task Flows** option taking up most of the space, select the double up arrow on the right-hand side to minimize it.

    ![](../media/Lab-1---April-2026/image37.png)

11. You now have the basis for how you will begin to ingest the streaming data into your OneLake. The next step is to create an eventstream to capture the data in motion that is available to us in this environment.

    ![](../media/Lab-1---April-2026/image38.png)

In this lab, we explored the Real-Time Intelligence interface, examined the Real-Time hub, created a Fabric workspace, and an Eventhouse that came with a KQL Database. In the next lab, you will begin to explore techniques that ingest data from various sources across your data estate to OneLake and do some basic analysis with the Kusto Query Language (KQL).

# References

Fabric Real-time Intelligence in a Day (RTIAD) introduces you to some of the key functions available in Microsoft Fabric.

In the menu of the service, the Help (?) section has links to some great resources. Keep in mind the view that you see depends upon what experience you are currently in and therefore your options may look different than the screenshot below.

![](../media/Lab-1---April-2026/image39.png)

Here are a few more resources that will help you with your next steps with Microsoft Fabric.

- Access all the information in the main [Microsoft Fabric Documentation](https://learn.microsoft.com/en-us/fabric/)

- Explore Fabric through the [<u>Guided Tour</u>](https://aka.ms/Fabric-GuidedTour)

- Sign up for the [<u>Microsoft Fabric free trial</u>](https://aka.ms/try-fabric)

- Visit the [<u>Microsoft Fabric website</u>](https://aka.ms/microsoft-fabric)

- Learn new skills by exploring the [<u>Fabric Learning modules</u>](https://aka.ms/learn-fabric)

- Explore the [<u>Fabric technical documentation</u>](https://aka.ms/fabric-docs)

- Read the [<u>free e-book on getting started with Fabric</u>](https://aka.ms/fabric-get-started-ebook)

- Join the [<u>Fabric community</u>](https://aka.ms/fabric-community) to post your questions, share your feedback, and learn from others

Read the more in-depth Fabric experience announcement blogs:

- [Data Factory experience in Fabric](https://learn.microsoft.com/en-us/fabric/data-factory/data-factory-overview)

- [Data Engineering Experience in Fabric](https://learn.microsoft.com/en-us/fabric/data-engineering/data-engineering-overview)

- [Data Science experience in Fabric](https://learn.microsoft.com/en-us/fabric/data-science/data-science-overview)

- [Data Warehousing experience in Fabric](https://learn.microsoft.com/en-us/fabric/data-warehouse/data-warehousing)

- [Real-Time Intelligence experience in Fabric](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/)

- [Power BI updates announcement blog](https://powerbi.microsoft.com/en-us/blog/)

- [Activator experience in Fabric](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/data-activator/activator-introduction)

- [Administration and governance in Fabric](https://learn.microsoft.com/en-us/fabric/governance/governance-compliance-overview)

- [OneLake in Fabric](https://learn.microsoft.com/en-us/fabric/onelake/onelake-overview)

- [Dataverse and Microsoft Fabric integration](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/azure-synapse-link-view-in-fabric)

© 2024 Microsoft Corporation. All rights reserved.

 By using this demo/lab, you agree to the following terms:

 The technology/functionality described in this demo/lab is provided by Microsoft Corporation for purposes of obtaining your feedback and to provide you with a learning experience. You may only use the demo/lab to evaluate such technology features and functionality and provide feedback to Microsoft. You may not use it for any other purpose. You may not modify, copy, distribute, transmit, display, perform, reproduce, publish, license, create derivative works from, transfer, or sell this demo/lab or any portion thereof.
 
 COPYING OR REPRODUCTION OF THE DEMO/LAB (OR ANY PORTION OF IT) TO ANY OTHER SERVER OR LOCATION FOR FURTHER REPRODUCTION OR REDISTRIBUTION IS EXPRESSLY PROHIBITED.
 
 THIS DEMO/LAB PROVIDES CERTAIN SOFTWARE TECHNOLOGY/PRODUCT FEATURES AND FUNCTIONALITY, INCLUDING POTENTIAL NEW FEATURES AND CONCEPTS, IN A SIMULATED ENVIRONMENT WITHOUT COMPLEX SET-UP OR INSTALLATION FOR THE PURPOSE DESCRIBED ABOVE. THE TECHNOLOGY/CONCEPTS REPRESENTED IN THIS DEMO/LAB MAY NOT REPRESENT FULL FEATURE FUNCTIONALITY AND MAY NOT WORK THE WAY A FINAL VERSION MAY WORK. WE ALSO MAY NOT RELEASE A FINAL VERSION OF SUCH FEATURES OR CONCEPTS. YOUR EXPERIENCE WITH USING SUCH FEATURES AND FUNCITONALITY IN A PHYSICAL ENVIRONMENT MAY ALSO BE DIFFERENT.
 
**FEEDBACK** If you give feedback about the technology features, functionality and/or concepts described in this demo/lab to Microsoft, you give to Microsoft, without charge, the right to use, share and commercialize your feedback in any way and for any purpose. You also give to third parties, without charge, any patent rights needed for their products, technologies and services to use or interface with any specific parts of a Microsoft software or service that includes the feedback. You will not give feedback that is subject to a license that requires Microsoft to license its software or documentation to third parties because we include your feedback in them. These rights survive this agreement.

MICROSOFT CORPORATION HEREBY DISCLAIMS ALL WARRANTIES AND CONDITIONS WITH REGARD TO THE DEMO/LAB, INCLUDING ALL WARRANTIES AND CONDITIONS OF MERCHANTABILITY, WHETHER EXPRESS, IMPLIED OR STATUTORY, FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. MICROSOFT DOES NOT MAKE ANY ASSURANCES OR REPRESENTATIONS WITH REGARD TO THE ACCURACY OF THE RESULTS, OUTPUT THAT DERIVES FROM USE OF DEMO/ LAB, OR SUITABILITY OF THE INFORMATION CONTAINED IN THE DEMO/LAB FOR ANY PURPOSE. 

**DISCLAIMER** 

This demo/lab contains only a portion of new features and enhancements in Microsoft Power BI. Some of the features might change in future releases of the product. In this demo/lab, you will learn about some, but not all, new features.
