const ISSUE_LABELS = {
    no_website: 'No business website found',
    insecure_website: 'Website does not use HTTPS',
    missing_mobile_viewport: 'No mobile viewport was detected',
    missing_contact_form: 'No contact form was detected',
    missing_booking_cta: 'No booking or quote call-to-action was detected',
    outdated_copyright: 'Website copyright appears out of date',
    missing_page_title: 'Homepage has no useful page title',
    missing_meta_description: 'Homepage has no meta description',
    no_analytics_detected: 'No common analytics tag was detected',
    low_review_count: 'Google review count is low',
    rating_below_four: 'Google rating is below 4.0',
    no_public_email: 'No public business email was found',
};

export const SERVICE_PRESETS = {
    website_redesign: {
        title: 'Website redesign',
        pitch: 'a clearer, more conversion-focused website',
    },
    local_seo: {
        title: 'Local SEO',
        pitch: 'stronger local search visibility',
    },
    reputation: {
        title: 'Reputation growth',
        pitch: 'a stronger review and reputation strategy',
    },
    general_sales: {
        title: 'General B2B prospecting',
        pitch: 'a service relevant to their business',
    },
};

function addIssue(issues, code, points) {
    issues.push({ code, label: ISSUE_LABELS[code], points });
}

function assessWebsiteRedesign(business, signals) {
    const issues = [];
    if (!business.website || signals.status === 'no_website') {
        addIssue(issues, 'no_website', 90);
        return issues;
    }
    if (signals.secure_https === false) addIssue(issues, 'insecure_website', 25);
    if (signals.mobile_viewport === false) addIssue(issues, 'missing_mobile_viewport', 25);
    if (signals.contact_form === false) addIssue(issues, 'missing_contact_form', 15);
    if (signals.booking_cta === false) addIssue(issues, 'missing_booking_cta', 15);
    if (signals.outdated_copyright === true) addIssue(issues, 'outdated_copyright', 20);
    if (signals.page_title_present === false) addIssue(issues, 'missing_page_title', 10);
    return issues;
}

function assessLocalSeo(business, signals) {
    const issues = [];
    if (!business.website || signals.status === 'no_website') {
        addIssue(issues, 'no_website', 85);
        return issues;
    }
    if (signals.page_title_present === false) addIssue(issues, 'missing_page_title', 25);
    if (signals.meta_description_present === false) addIssue(issues, 'missing_meta_description', 20);
    if ((business.reviews ?? 0) < 10) addIssue(issues, 'low_review_count', 25);
    if ((business.rating ?? 5) < 4) addIssue(issues, 'rating_below_four', 20);
    if (signals.analytics_detected === false) addIssue(issues, 'no_analytics_detected', 10);
    return issues;
}

function assessReputation(business) {
    const issues = [];
    if ((business.reviews ?? 0) < 10) addIssue(issues, 'low_review_count', 55);
    if ((business.rating ?? 5) < 4) addIssue(issues, 'rating_below_four', 45);
    return issues;
}

function assessGeneral(contacts) {
    const issues = [];
    if (!contacts.best_email) addIssue(issues, 'no_public_email', 20);
    return issues;
}

export function assessOpportunity(business, contacts, websiteSignals, presetName) {
    const preset = SERVICE_PRESETS[presetName] ?? SERVICE_PRESETS.website_redesign;
    let issues;
    if (presetName === 'local_seo') issues = assessLocalSeo(business, websiteSignals);
    else if (presetName === 'reputation') issues = assessReputation(business);
    else if (presetName === 'general_sales') issues = assessGeneral(contacts);
    else issues = assessWebsiteRedesign(business, websiteSignals);

    const score = Math.min(
        100,
        issues.reduce((total, issue) => total + issue.points, presetName === 'general_sales' ? 50 : 0),
    );
    const primaryIssue = issues[0]?.label ?? null;
    const summary = primaryIssue
        ? `${preset.title}: ${issues.map((issue) => issue.label.toLowerCase()).join('; ')}.`
        : `No strong ${preset.title.toLowerCase()} opportunity was detected from the public data checked.`;
    const pitchAngle = primaryIssue
        ? `${primaryIssue}. Offer ${preset.pitch}.`
        : `Offer ${preset.pitch}, but review the business manually before contacting it.`;

    return {
        preset: presetName,
        type: preset.title,
        score,
        issues,
        primary_issue: primaryIssue,
        summary,
        pitch_angle: pitchAngle,
    };
}

export function scoreQualification(business, contacts, opportunity, input) {
    const bestEmail = contacts.emails.find((item) => item.value === contacts.best_email);
    const hasUsableEmail = Boolean(bestEmail) && bestEmail.mx_valid !== false;
    const hasPhone = contacts.phones.length > 0;
    const hasMobile = contacts.phones.some((phone) => phone.is_mobile);
    let contactScore = 0;
    const reasons = [];

    if (bestEmail) {
        let emailPoints = 40;
        if (bestEmail.mx_valid === true) emailPoints = 55;
        if (bestEmail.mx_valid === false) emailPoints = 10;
        contactScore += emailPoints;
        reasons.push(
            bestEmail.mx_valid === true ? 'has_mx_verified_business_email' : 'has_public_business_email',
        );
        if (bestEmail.same_domain) {
            contactScore += 10;
            reasons.push('email_matches_business_domain');
        }
    }
    if (hasPhone) {
        contactScore += 25;
        reasons.push('has_phone');
    }
    if (hasMobile) {
        contactScore += 10;
        reasons.push('has_uk_mobile');
    }
    contactScore = Math.min(100, contactScore);

    const requirementMet = {
        any: true,
        email: Boolean(contacts.best_email),
        verified_email: bestEmail?.mx_valid === true,
        phone: hasPhone,
        email_or_phone: hasUsableEmail || hasPhone,
    }[input.contactRequirement];
    const score = Math.round(contactScore * 0.6 + opportunity.score * 0.4);
    const notQualifiedReasons = [];
    if (!requirementMet) notQualifiedReasons.push(`contact_requirement_not_met:${input.contactRequirement}`);
    if (score < input.minimumLeadScore) notQualifiedReasons.push('below_minimum_lead_score');

    return {
        score,
        contact_score: contactScore,
        opportunity_score: opportunity.score,
        is_qualified: Boolean(requirementMet) && score >= input.minimumLeadScore,
        reasons: [...reasons, ...opportunity.issues.map((issue) => issue.code)],
        not_qualified_reasons: notQualifiedReasons,
    };
}
