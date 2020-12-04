/**
 * @module botbuilder-dialogs-adaptive
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as Recognizers from '@microsoft/recognizers-text-choice';
import {
    EnumExpression,
    EnumExpressionConverter,
    Expression,
    ObjectExpression,
    ObjectExpressionConverter,
    StringExpression,
    StringExpressionConverter,
} from 'adaptive-expressions';
import { Activity } from 'botbuilder-core';
import {
    Choice,
    ChoiceFactory,
    ChoiceFactoryOptions,
    Converter,
    ConverterFactory,
    DialogContext,
    ListStyle,
    PromptCultureModels,
    recognizeChoices,
} from 'botbuilder-dialogs';
import { ChoiceSet } from './choiceSet';
import { InputDialog, InputDialogConfiguration, InputState } from './inputDialog';

export interface ConfirmInputConfiguration extends InputDialogConfiguration {
    defaultLocale?: string | Expression | StringExpression;
    style?: ListStyle | string | Expression | EnumExpression<ListStyle>;
    choiceOptions?: ChoiceFactoryOptions | string | Expression | ObjectExpression<ChoiceFactoryOptions>;
    confirmChoices?: ChoiceSet | string | Expression | ObjectExpression<ChoiceSet>;
    outputFormat?: string | Expression | StringExpression;
}

/**
 * Declarative input control that will gather yes/no confirmation input from a set of choices.
 */
export class ConfirmInput extends InputDialog implements ConfirmInputConfiguration {
    public static $kind = 'Microsoft.ConfirmInput';

    /**
     * Default options for rendering the choices to the user based on locale.
     */
    private static defaultChoiceOptions: {
        [locale: string]: { choices: (string | Choice)[]; options: ChoiceFactoryOptions };
    } = {
        'es-es': {
            choices: ['Sí', 'No'],
            options: { inlineSeparator: ', ', inlineOr: ' o ', inlineOrMore: ', o ', includeNumbers: true },
        },
        'nl-nl': {
            choices: ['Ja', 'Nee'],
            options: { inlineSeparator: ', ', inlineOr: ' of ', inlineOrMore: ', of ', includeNumbers: true },
        },
        'en-us': {
            choices: ['Yes', 'No'],
            options: { inlineSeparator: ', ', inlineOr: ' or ', inlineOrMore: ', or ', includeNumbers: true },
        },
        'fr-fr': {
            choices: ['Oui', 'Non'],
            options: { inlineSeparator: ', ', inlineOr: ' ou ', inlineOrMore: ', ou ', includeNumbers: true },
        },
        'de-de': {
            choices: ['Ja', 'Nein'],
            options: { inlineSeparator: ', ', inlineOr: ' oder ', inlineOrMore: ', oder ', includeNumbers: true },
        },
        'ja-jp': {
            choices: ['はい', 'いいえ'],
            options: { inlineSeparator: '、 ', inlineOr: ' または ', inlineOrMore: '、 または ', includeNumbers: true },
        },
        'pt-br': {
            choices: ['Sim', 'Não'],
            options: { inlineSeparator: ', ', inlineOr: ' ou ', inlineOrMore: ', ou ', includeNumbers: true },
        },
        'zh-cn': {
            choices: ['是的', '不'],
            options: { inlineSeparator: '， ', inlineOr: ' 要么 ', inlineOrMore: '， 要么 ', includeNumbers: true },
        },
    };

    /**
     * The prompts default locale that should be recognized.
     */
    public defaultLocale?: StringExpression;

    /**
     * Style of the "yes" and "no" choices rendered to the user when prompting.
     *
     * @remarks
     * Defaults to `ListStyle.auto`.
     */
    public style: EnumExpression<ListStyle> = new EnumExpression<ListStyle>(ListStyle.auto);

    /**
     * Additional options passed to the `ChoiceFactory` and used to tweak the style of choices
     * rendered to the user.
     */
    public choiceOptions?: ObjectExpression<ChoiceFactoryOptions> = new ObjectExpression();

    /**
     * Custom list of choices to send for the prompt.
     */
    public confirmChoices?: ObjectExpression<ChoiceSet> = new ObjectExpression();

    /**
     * The expression of output format.
     */
    public outputFormat: StringExpression;

    public getConverter(property: keyof ConfirmInputConfiguration): Converter | ConverterFactory {
        switch (property) {
            case 'defaultLocale':
                return new StringExpressionConverter();
            case 'style':
                return new EnumExpressionConverter<ListStyle>(ListStyle);
            case 'choiceOptions':
                return new ObjectExpressionConverter<ChoiceFactoryOptions>();
            case 'confirmChoices':
                return new ObjectExpressionConverter<ChoiceSet>();
            case 'outputFormat':
                return new StringExpressionConverter();
            default:
                return super.getConverter(property);
        }
    }

     /**
     * @protected
     */
    protected onComputeId(): string {
        return `ConfirmInput[${this.prompt && this.prompt.toString()}]`;
    }

    /**
     * @protected
     * Called when input has been received.
     * @param dc The [DialogContext](xref:botbuilder-dialogs.DialogContext) for the current turn of conversation.
     * @returns [InputState](xref:botbuilder-dialogs-adaptive.InputState) which reflects whether input was recognized as valid or not.
     */
    protected async onRecognizeInput(dc: DialogContext): Promise<InputState> {
        // Recognize input if needed
        let input = dc.state.getValue(InputDialog.VALUE_PROPERTY);
        if (typeof input !== 'boolean') {
            // Find locale to use
            const locale = this.determineCulture(dc);

            // Recognize input
            const results = Recognizers.recognizeBoolean(input, locale);
            if (results.length > 0 && results[0].resolution) {
                input = results[0].resolution.value;
                dc.state.setValue(InputDialog.VALUE_PROPERTY, !!input);
                if (this.outputFormat) {
                    const value = this.outputFormat.getValue(dc.state);
                    dc.state.setValue(InputDialog.VALUE_PROPERTY, value);
                }
                return InputState.valid;
            } else {
                // Fallback to trying the choice recognizer
                const confirmChoices =
                    (this.confirmChoices && this.confirmChoices.getValue(dc.state)) ||
                    ConfirmInput.defaultChoiceOptions[locale].choices;
                const choices = ChoiceFactory.toChoices(confirmChoices);
                const results = recognizeChoices(input, choices);
                if (results.length > 0) {
                    input = results[0].resolution.index == 0;
                    dc.state.setValue(InputDialog.VALUE_PROPERTY, input);
                } else {
                    return InputState.unrecognized;
                }
            }
        }

        return InputState.valid;
    }

    /**
     * @protected
     * Method which renders the prompt to the user given the current input state.
     * @param dc The [DialogContext](xref:botbuilder-dialogs.DialogContext) for the current turn of conversation.
     * @param state Dialog [InputState](xref:botbuilder-dialogs-adaptive.InputState).
     * @returns An [Activity](xref:botframework-schema.Activity) `Promise` representing the asynchronous operation.
     */
    protected async onRenderPrompt(dc: DialogContext, state: InputState): Promise<Partial<Activity>> {
        // Determine locale
        let locale = this.determineCulture(dc);

        // Format choices
        const confirmChoices =
            (this.confirmChoices && this.confirmChoices.getValue(dc.state)) ||
            ConfirmInput.defaultChoiceOptions[locale].choices;
        const choices = ChoiceFactory.toChoices(confirmChoices);

        // Format prompt to send
        const prompt = await super.onRenderPrompt(dc, state);
        const channelId = dc.context.activity.channelId;
        const choiceOptions =
            (this.choiceOptions && this.choiceOptions.getValue(dc.state)) ||
            ConfirmInput.defaultChoiceOptions[locale].options;
        const style = this.style.getValue(dc.state);
        return Promise.resolve(this.appendChoices(prompt, channelId, choices, style, choiceOptions));
    }

    private determineCulture(dc: DialogContext): string {
        let culture = PromptCultureModels.mapToNearestLanguage(dc.context.activity.locale || (this.defaultLocale && this.defaultLocale.getValue(dc.state)));
        if (!(culture && ConfirmInput.defaultChoiceOptions.hasOwnProperty(culture))) {
            culture = PromptCultureModels.English.locale;
        }

        return culture;
    }
}